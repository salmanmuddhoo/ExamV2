-- Add better logging and error handling to referral points awarding

-- Create a log table to track referral points attempts
CREATE TABLE IF NOT EXISTS referral_points_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES user_subscriptions(id),
  user_id UUID REFERENCES profiles(id),
  referrer_id UUID REFERENCES profiles(id),
  tier_name TEXT,
  referral_points_awarded INTEGER,
  status TEXT, -- 'success', 'skipped', 'error'
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_points_log_subscription_id ON referral_points_log(subscription_id);
CREATE INDEX IF NOT EXISTS idx_referral_points_log_created_at ON referral_points_log(created_at DESC);

-- Update award_referral_points with detailed logging
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

  -- Check if this user was referred and points haven't been awarded yet
  SELECT * INTO v_referral
  FROM referrals
  WHERE referred_id = v_subscription.user_id
    AND status = 'pending';

  IF NOT FOUND THEN
    INSERT INTO referral_points_log (subscription_id, user_id, tier_name, status, reason)
    VALUES (p_subscription_id, v_subscription.user_id, v_subscription.tier_name, 'skipped', 'No pending referral found - either not referred or already awarded');
    RETURN;
  END IF;

  -- Get points to award
  v_points := COALESCE(v_subscription.referral_points_awarded, 0);

  IF v_points <= 0 THEN
    INSERT INTO referral_points_log (subscription_id, user_id, referrer_id, tier_name, referral_points_awarded, status, reason)
    VALUES (p_subscription_id, v_subscription.user_id, v_referral.referrer_id, v_subscription.tier_name, v_points, 'skipped', 'No points configured for this tier');
    RETURN;
  END IF;

  -- Update referral status
  UPDATE referrals
  SET status = 'completed',
      points_awarded = v_points,
      subscription_tier_id = v_subscription.tier_id,
      completed_at = NOW()
  WHERE id = v_referral.id;

  -- Update referrer's points balance
  UPDATE user_referral_points
  SET points_balance = points_balance + v_points,
      total_earned = total_earned + v_points,
      successful_referrals = successful_referrals + 1,
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
    format('Earned %s points from referral purchasing %s tier', v_points, v_subscription.tier_name)
  );

  -- Log success
  INSERT INTO referral_points_log (subscription_id, user_id, referrer_id, tier_name, referral_points_awarded, status, reason)
  VALUES (p_subscription_id, v_subscription.user_id, v_referral.referrer_id, v_subscription.tier_name, v_points, 'success', format('Awarded %s points to referrer', v_points));

EXCEPTION
  WHEN OTHERS THEN
    -- Log error
    INSERT INTO referral_points_log (subscription_id, user_id, tier_name, status, reason)
    VALUES (p_subscription_id, v_subscription.user_id, v_subscription.tier_name, 'error', format('Error: %s', SQLERRM));
    RAISE;
END;
$$;

COMMENT ON TABLE referral_points_log IS 'Logs all attempts to award referral points for debugging';
COMMENT ON FUNCTION award_referral_points IS 'Awards points to referrer when their referral purchases a paid subscription. Now includes detailed logging.';
