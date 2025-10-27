-- Fix expire_yearly_subscriptions() function to avoid ON CONFLICT error
-- Completely rewrite to use a loop-based approach instead of bulk INSERT

CREATE OR REPLACE FUNCTION expire_yearly_subscriptions()
RETURNS void AS $$
DECLARE
  v_free_tier_id UUID;
  v_expired_count INTEGER := 0;
  v_user_id UUID;
BEGIN
  -- Get free tier ID
  SELECT id INTO v_free_tier_id
  FROM subscription_tiers
  WHERE name = 'free' AND is_active = TRUE
  LIMIT 1;

  -- Step 1: Mark all expired yearly subscriptions as 'expired'
  UPDATE user_subscriptions
  SET
    status = 'expired',
    updated_at = NOW()
  WHERE
    status = 'active'
    AND billing_cycle = 'yearly'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  -- Step 2: For each unique user with an expired subscription,
  -- ensure they have a free tier subscription
  FOR v_user_id IN
    SELECT DISTINCT us.user_id
    FROM user_subscriptions us
    WHERE us.status = 'expired'
      AND us.billing_cycle = 'yearly'
      AND us.subscription_end_date IS NOT NULL
      AND us.subscription_end_date < NOW()
      -- Only process users who don't already have an active subscription
      AND NOT EXISTS (
        SELECT 1
        FROM user_subscriptions us2
        WHERE us2.user_id = us.user_id
          AND us2.status = 'active'
      )
  LOOP
    -- Insert free tier subscription for this user
    INSERT INTO user_subscriptions (
      user_id,
      tier_id,
      status,
      billing_cycle,
      is_recurring,
      period_start_date,
      period_end_date,
      tokens_used_current_period,
      papers_accessed_current_period
    )
    VALUES (
      v_user_id,
      v_free_tier_id,
      'active',
      'monthly',
      FALSE,
      NOW(),
      NOW() + INTERVAL '30 days',
      0,
      0
    )
    ON CONFLICT (user_id) WHERE (status = 'active') DO UPDATE SET
      tier_id = v_free_tier_id,
      status = 'active',
      billing_cycle = 'monthly',
      is_recurring = FALSE,
      period_start_date = NOW(),
      period_end_date = NOW() + INTERVAL '30 days',
      tokens_used_current_period = 0,
      papers_accessed_current_period = 0,
      accessed_paper_ids = ARRAY[]::uuid[],
      updated_at = NOW();
  END LOOP;

  RAISE NOTICE 'Expired % yearly subscriptions', v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION expire_yearly_subscriptions IS
  'Expires yearly subscriptions when they reach their subscription_end_date (1 year after purchase) and downgrades to free tier. Uses a loop to process each user individually to avoid ON CONFLICT issues with duplicate user_ids.';
