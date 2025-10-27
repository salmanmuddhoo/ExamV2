-- ============================================================
-- FIX: expire_yearly_subscriptions() Function
-- ============================================================
-- This fixes the "ON CONFLICT DO UPDATE command cannot affect row a second time" error
-- The issue occurs when a user has multiple expired yearly subscriptions
-- Solution: Use DISTINCT to ensure each user_id is only processed once
-- ============================================================

-- Drop and recreate the function with the fix
CREATE OR REPLACE FUNCTION expire_yearly_subscriptions()
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

  -- Expire yearly subscriptions that have reached their subscription_end_date
  WITH expired_subs AS (
    UPDATE user_subscriptions
    SET
      status = 'expired',
      updated_at = NOW()
    WHERE
      status = 'active'
      AND billing_cycle = 'yearly'
      AND subscription_end_date IS NOT NULL
      AND subscription_end_date < NOW()
    RETURNING user_id
  )
  -- Downgrade expired users to free tier
  -- Use DISTINCT to ensure each user_id is only processed once
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
  SELECT DISTINCT ON (user_id)  -- FIX: Added DISTINCT ON to prevent duplicate user_ids
    user_id,
    v_free_tier_id,
    'active',
    'monthly',
    FALSE,
    NOW(),
    NOW() + INTERVAL '30 days',
    0,
    0
  FROM expired_subs
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

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  RAISE NOTICE 'Expired % yearly subscriptions', v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add helpful comment
COMMENT ON FUNCTION expire_yearly_subscriptions IS
  'Expires yearly subscriptions when they reach their subscription_end_date (1 year after purchase) and downgrades to free tier. Uses DISTINCT to handle cases where a user has multiple expired subscriptions.';


-- ============================================================
-- VERIFY THE FIX
-- ============================================================

-- Check if the function was updated successfully
SELECT
  routine_name,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'expire_yearly_subscriptions';

-- Now you can run the function again:
-- SELECT expire_yearly_subscriptions();
