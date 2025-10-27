-- Diagnose and fix cancelled yearly subscriptions not getting monthly token refills
-- Problem: Cancelled yearly subscriptions have is_recurring=FALSE, preventing token resets

-- Step 1: Check all cancelled yearly subscriptions
SELECT
  us.user_id,
  p.email,
  st.display_name as tier,
  us.billing_cycle,
  us.cancel_at_period_end,
  us.is_recurring,
  us.status,
  us.period_end_date as next_token_reset,
  us.subscription_end_date as yearly_subscription_ends,
  us.tokens_used_current_period,
  COALESCE(us.token_limit_override, st.token_limit) as token_limit,
  CASE
    WHEN us.period_end_date < NOW() THEN '⚠️ OVERDUE FOR RESET'
    ELSE '✓ Next reset: ' || us.period_end_date::date::text
  END as reset_status,
  CASE
    WHEN us.is_recurring = FALSE THEN '❌ WILL NOT RESET (is_recurring=FALSE)'
    ELSE '✓ Will reset monthly'
  END as will_reset
FROM user_subscriptions us
LEFT JOIN profiles p ON us.user_id = p.id
LEFT JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.cancel_at_period_end = TRUE
  AND us.status = 'active'
ORDER BY us.period_end_date;

-- Step 2: Fix cancelled yearly subscriptions that have is_recurring=FALSE
-- This should be TRUE so they continue to get monthly token refills until subscription_end_date
UPDATE user_subscriptions
SET
  is_recurring = TRUE,
  updated_at = NOW()
WHERE billing_cycle = 'yearly'
  AND cancel_at_period_end = TRUE
  AND status = 'active'
  AND is_recurring = FALSE
  AND subscription_end_date IS NOT NULL
  AND subscription_end_date > NOW();

-- Step 3: Check if any subscriptions are overdue for token reset
SELECT
  us.user_id,
  p.email,
  st.display_name as tier,
  us.period_end_date as should_have_reset_on,
  NOW() - us.period_end_date as overdue_by,
  us.tokens_used_current_period as current_usage,
  COALESCE(us.token_limit_override, st.token_limit) as current_limit
FROM user_subscriptions us
LEFT JOIN profiles p ON us.user_id = p.id
LEFT JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.cancel_at_period_end = TRUE
  AND us.status = 'active'
  AND us.period_end_date < NOW()
  AND us.subscription_end_date > NOW();

-- Step 4: Manually trigger token reset for overdue subscriptions
-- This will reset tokens for all subscriptions that should have been reset
SELECT reset_subscription_period();

-- Step 5: Verify the fix worked
SELECT
  us.user_id,
  p.email,
  st.display_name as tier,
  us.billing_cycle,
  us.cancel_at_period_end,
  us.is_recurring,
  us.period_end_date as next_token_reset,
  us.subscription_end_date as yearly_subscription_ends,
  us.tokens_used_current_period as tokens_used,
  COALESCE(us.token_limit_override, st.token_limit) as token_limit,
  CASE
    WHEN us.tokens_used_current_period = 0 AND us.period_end_date > NOW() THEN '✅ RESET SUCCESSFUL'
    WHEN us.period_end_date < NOW() THEN '⚠️ Still overdue - check reset_subscription_period() function'
    ELSE '✓ Will reset on ' || us.period_end_date::date
  END as status
FROM user_subscriptions us
LEFT JOIN profiles p ON us.user_id = p.id
LEFT JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.cancel_at_period_end = TRUE
  AND us.status = 'active'
ORDER BY us.period_end_date;

-- Step 6: Check when the daily reset cron job runs
SELECT
  jobname,
  schedule,
  command,
  active,
  CASE
    WHEN active THEN '✅ Active'
    ELSE '❌ Not Active'
  END as status
FROM cron.job
WHERE command LIKE '%reset_subscription_period%'
  OR command LIKE '%expire_%';
