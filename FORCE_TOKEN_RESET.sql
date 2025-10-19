-- Force token reset for testing
-- This script will manually set your period_end_date to the past and trigger a reset

-- Step 1: Check current state
SELECT
  email,
  tokens_used_current_period as tokens_before,
  period_end_date as old_period_end,
  NOW() as current_time
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
WHERE p.email = 'salman2@test.com';

-- Step 2: Set period_end_date to the past (so cron will reset it)
UPDATE user_subscriptions
SET period_end_date = NOW() - INTERVAL '1 day'
WHERE user_id = (SELECT id FROM profiles WHERE email = 'salman2@test.com');

-- Step 3: Verify it's now in the past
SELECT
  email,
  period_end_date,
  NOW() as current_time,
  (period_end_date < NOW()) as is_expired
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
WHERE p.email = 'salman2@test.com';

-- Step 4: Run the token reset function
SELECT reset_subscription_period();

-- Step 5: Check the results (tokens should be 0, period_end_date should be ~1 month from now)
SELECT
  email,
  tokens_used_current_period as tokens_after,
  period_start_date as new_period_start,
  period_end_date as new_period_end,
  token_limit_override,
  updated_at
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
WHERE p.email = 'salman2@test.com';

-- Expected Results:
-- tokens_after: 0
-- new_period_start: approximately NOW()
-- new_period_end: approximately NOW() + 1 month
-- token_limit_override: NULL (carryover cleared)
