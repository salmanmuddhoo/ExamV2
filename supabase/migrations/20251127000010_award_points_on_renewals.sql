-- Modify referral system to award points on every purchase (renewals included)
-- Previously: Points awarded only once on first purchase
-- Now: Points awarded every time the referred user purchases/renews

-- Add a counter to track how many times points were awarded
ALTER TABLE referrals
ADD COLUMN IF NOT EXISTS times_awarded INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_awarded_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN referrals.times_awarded IS 'Number of times points were awarded to referrer (including renewals)';
COMMENT ON COLUMN referrals.last_awarded_at IS 'Timestamp of last points award';

-- Update award_referral_points to award on every purchase, not just first
CREATE OR REPLACE FUNCTION award_referral_points(p_subscription_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription RECORD;
  v_referral RECORD;
  v_points INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Get subscription details
  SELECT us.user_id, us.tier_id, st.name as tier_name, st.referral_points_awarded
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.id = p_subscription_id;

  IF NOT FOUND THEN
    INSERT INTO referral_points_log (subscription_id, status, reason)
    VALUES (p_subscription_id, 'skipped', 'Subscription not found');
    RETURN;
  END IF;

  -- Only award points for paid tiers (not free tier)
  IF v_subscription.tier_name = 'free' THEN
    INSERT INTO referral_points_log (subscription_id, user_id, tier_name, status, reason)
    VALUES (p_subscription_id, v_subscription.user_id, v_subscription.tier_name, 'skipped', 'Free tier - no points awarded');
    RETURN;
  END IF;

  -- Check if this user was referred (ANY status, not just pending)
  -- CHANGED: Now awards points on renewals too
  SELECT * INTO v_referral
  FROM referrals
  WHERE referred_id = v_subscription.user_id;

  IF NOT FOUND THEN
    INSERT INTO referral_points_log (subscription_id, user_id, tier_name, status, reason)
    VALUES (p_subscription_id, v_subscription.user_id, v_subscription.tier_name, 'skipped', 'User was not referred - no referral record found');
    RETURN;
  END IF;

  -- Get points to award
  v_points := COALESCE(v_subscription.referral_points_awarded, 0);

  IF v_points <= 0 THEN
    INSERT INTO referral_points_log (subscription_id, user_id, referrer_id, tier_name, referral_points_awarded, status, reason)
    VALUES (p_subscription_id, v_subscription.user_id, v_referral.referrer_id, v_subscription.tier_name, v_points, 'skipped', 'No points configured for this tier');
    RETURN;
  END IF;

  -- Update referral record (track how many times awarded)
  UPDATE referrals
  SET times_awarded = COALESCE(times_awarded, 0) + 1,
      last_awarded_at = NOW(),
      -- Set status to 'completed' on first award if still 'pending'
      status = CASE WHEN status = 'pending' THEN 'completed' ELSE status END,
      -- Set completed_at on first award if not set
      completed_at = CASE WHEN completed_at IS NULL THEN NOW() ELSE completed_at END,
      -- Update subscription_tier_id to latest tier
      subscription_tier_id = v_subscription.tier_id
  WHERE id = v_referral.id;

  -- Update referrer's points balance
  UPDATE user_referral_points
  SET points_balance = points_balance + v_points,
      total_earned = total_earned + v_points,
      -- Only increment successful_referrals on first award
      successful_referrals = CASE
        WHEN v_referral.times_awarded = 0 THEN successful_referrals + 1
        ELSE successful_referrals
      END,
      updated_at = NOW()
  WHERE user_id = v_referral.referrer_id
  RETURNING points_balance INTO v_new_balance;

  -- Record transaction
  INSERT INTO referral_transactions (
    user_id,
    transaction_type,
    points,
    balance_after,
    referral_id,
    subscription_id,
    description
  )
  VALUES (
    v_referral.referrer_id,
    'earned',
    v_points,
    v_new_balance,
    v_referral.id,
    p_subscription_id,
    format('Earned %s points from referral %s %s tier (award #%s)',
      v_points,
      CASE WHEN v_referral.times_awarded = 0 THEN 'purchasing' ELSE 'renewing' END,
      v_subscription.tier_name,
      COALESCE(v_referral.times_awarded, 0) + 1
    )
  );

  -- Log success
  INSERT INTO referral_points_log (subscription_id, user_id, referrer_id, tier_name, referral_points_awarded, status, reason)
  VALUES (
    p_subscription_id,
    v_subscription.user_id,
    v_referral.referrer_id,
    v_subscription.tier_name,
    v_points,
    'success',
    format('Awarded %s points to referrer (award #%s - %s)',
      v_points,
      COALESCE(v_referral.times_awarded, 0) + 1,
      CASE WHEN v_referral.times_awarded = 0 THEN 'first purchase' ELSE 'renewal' END
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log error
    INSERT INTO referral_points_log (subscription_id, user_id, tier_name, status, reason)
    VALUES (p_subscription_id, v_subscription.user_id, v_subscription.tier_name, 'error', format('Error: %s', SQLERRM));
    RAISE;
END;
$$;

COMMENT ON FUNCTION award_referral_points IS
'Awards points to referrer when their referral purchases a paid subscription.
NEW: Now awards points on EVERY purchase/renewal, not just first purchase.
Tracks number of times awarded in referrals.times_awarded field.';

-- Backfill times_awarded for existing completed referrals
UPDATE referrals
SET times_awarded = 1
WHERE status = 'completed' AND times_awarded = 0;
