-- Debug script to check subscription status and cron function

-- Step 1: Check if the function exists
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name IN (
  'reset_subscription_period',
  'run_subscription_maintenance',
  'expire_cancelled_subscriptions',
  'expire_non_recurring_subscriptions',
  'expire_yearly_subscriptions'
)
ORDER BY routine_name;

-- Step 2: Check your current subscription status
-- Replace 'YOUR_EMAIL_HERE' with your actual email
SELECT
  us.id,
  p.email,
  us.status,
  us.billing_cycle,
  us.is_recurring,
  us.cancel_at_period_end,
  us.period_start_date,
  us.period_end_date,
  us.subscription_end_date,
  us.tokens_used_current_period,
  st.token_limit,
  us.token_limit_override,
  NOW() as current_time,
  (us.period_end_date < NOW()) as period_expired
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
LEFT JOIN subscription_tiers st ON us.tier_id = st.id
WHERE p.email = 'YOUR_EMAIL_HERE';  -- Replace with your email

-- Step 3: Check which subscriptions SHOULD be reset
SELECT
  us.id,
  p.email,
  us.status,
  us.is_recurring,
  us.cancel_at_period_end,
  us.period_end_date,
  us.subscription_end_date,
  NOW() as current_time,
  (us.period_end_date < NOW()) as period_expired,
  CASE
    WHEN us.status != 'active' THEN 'Status not active'
    WHEN us.period_end_date >= NOW() THEN 'Period not expired yet'
    WHEN us.is_recurring = FALSE THEN 'Not recurring'
    WHEN us.cancel_at_period_end = TRUE THEN 'Marked for cancellation'
    WHEN us.billing_cycle = 'yearly' AND us.subscription_end_date < NOW() THEN 'Yearly subscription ended'
    ELSE 'Should be reset'
  END as reset_eligibility
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
ORDER BY us.created_at DESC
LIMIT 10;

-- Step 4: Manually set period_end_date to past for testing
-- Uncomment and replace email to test
-- UPDATE user_subscriptions
-- SET period_end_date = NOW() - INTERVAL '1 day'
-- WHERE user_id = (SELECT id FROM profiles WHERE email = 'YOUR_EMAIL_HERE');

-- Step 5: Run the maintenance function and see output
SELECT * FROM run_subscription_maintenance();

-- Step 6: Check if anything changed after running maintenance
SELECT
  us.id,
  p.email,
  us.tokens_used_current_period,
  us.period_start_date,
  us.period_end_date,
  us.updated_at
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
WHERE p.email = 'YOUR_EMAIL_HERE'  -- Replace with your email
ORDER BY us.updated_at DESC;
