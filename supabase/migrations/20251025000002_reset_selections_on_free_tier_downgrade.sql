-- Reset grade and subject selections when downgrading to free tier
-- Free tier users should not retain their previous Student/Student Lite package selections

-- Update expire_cancelled_subscriptions to reset selections
CREATE OR REPLACE FUNCTION expire_cancelled_subscriptions()
RETURNS void AS $$
DECLARE
  v_free_tier_id UUID;
BEGIN
  -- Get free tier ID
  SELECT id INTO v_free_tier_id
  FROM subscription_tiers
  WHERE name = 'free' AND is_active = TRUE
  LIMIT 1;

  -- Downgrade subscriptions that are marked for cancellation and have passed their end date to free tier
  UPDATE user_subscriptions
  SET
    tier_id = v_free_tier_id,
    status = 'active',
    billing_cycle = 'monthly',
    is_recurring = FALSE,
    period_start_date = NOW(),
    period_end_date = NOW() + INTERVAL '30 days',
    tokens_used_current_period = 0,
    papers_accessed_current_period = 0,
    accessed_paper_ids = ARRAY[]::uuid[],
    token_limit_override = NULL,
    cancel_at_period_end = FALSE,
    cancellation_reason = NULL,
    cancellation_requested_at = NULL,
    selected_grade_id = NULL,  -- Reset grade selection
    selected_subject_ids = NULL,  -- Reset subject selections
    updated_at = NOW()
  WHERE
    status = 'active'
    AND cancel_at_period_end = TRUE
    AND period_end_date <= NOW()
    AND v_free_tier_id IS NOT NULL;

  RAISE NOTICE 'Downgraded cancelled subscriptions to free tier';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update expire_non_recurring_subscriptions to reset selections
CREATE OR REPLACE FUNCTION expire_non_recurring_subscriptions()
RETURNS void AS $$
DECLARE
  v_free_tier_id UUID;
  v_expired_count INTEGER := 0;
BEGIN
  -- Get free tier ID
  SELECT id INTO v_free_tier_id
  FROM subscription_tiers
  WHERE name = 'free' AND is_active = TRUE
  LIMIT 1;

  -- Expire non-recurring subscriptions that have passed their end date
  -- and downgrade them to free tier
  WITH expired_subs AS (
    UPDATE user_subscriptions
    SET
      status = 'expired',
      updated_at = NOW()
    WHERE
      status = 'active'
      AND is_recurring = FALSE
      AND period_end_date < NOW()
    RETURNING user_id, tier_id, billing_cycle
  )
  SELECT COUNT(*) INTO v_expired_count FROM expired_subs;

  -- Create free tier subscriptions for users whose subscriptions expired
  -- Only if they don't already have an active subscription
  -- Reset grade and subject selections for fresh start
  INSERT INTO user_subscriptions (
    user_id,
    tier_id,
    status,
    billing_cycle,
    is_recurring,
    period_start_date,
    period_end_date,
    selected_grade_id,
    selected_subject_ids
  )
  SELECT
    es.user_id,
    v_free_tier_id,
    'active',
    'monthly',
    FALSE,
    NOW(),
    NOW() + INTERVAL '30 days',
    NULL,  -- No grade selection for free tier
    NULL   -- No subject selections for free tier
  FROM (
    SELECT DISTINCT user_id
    FROM user_subscriptions
    WHERE status = 'expired'
      AND user_id NOT IN (
        SELECT user_id
        FROM user_subscriptions
        WHERE status = 'active'
      )
  ) es
  WHERE v_free_tier_id IS NOT NULL
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'Expired % non-recurring subscriptions', v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION expire_cancelled_subscriptions IS
  'Downgrades cancelled subscriptions to free tier at period end. Resets grade/subject selections for clean slate.';

COMMENT ON FUNCTION expire_non_recurring_subscriptions IS
  'Expires non-recurring (MCB Juice) subscriptions and creates free tier. Resets grade/subject selections for clean slate.';
