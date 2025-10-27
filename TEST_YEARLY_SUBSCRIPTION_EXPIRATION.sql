-- ============================================================
-- TEST YEARLY SUBSCRIPTION EXPIRATION
-- ============================================================
-- This guide helps you test the yearly subscription expiration
-- by manually modifying dates in the database to simulate an
-- expired subscription.
-- ============================================================

-- ============================================================
-- STEP 1: FIND A TEST USER WITH YEARLY SUBSCRIPTION
-- ============================================================
-- Find a user with an active yearly subscription to test with

SELECT
  us.id as subscription_id,
  us.user_id,
  p.email,
  st.display_name as tier,
  us.billing_cycle,
  us.status,
  us.period_start_date,
  us.period_end_date,
  us.subscription_end_date,
  us.created_at
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.status = 'active'
ORDER BY us.created_at DESC
LIMIT 5;

-- ⚠️ COPY THE EMAIL AND USER_ID OF THE USER YOU WANT TO TEST WITH


-- ============================================================
-- STEP 2: BACKUP CURRENT SUBSCRIPTION DATA (IMPORTANT!)
-- ============================================================
-- Before making changes, save the current subscription data
-- Replace 'test@example.com' with your test user's email

-- View current subscription details
SELECT
  us.*
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
WHERE p.email = 'test@example.com'  -- ⚠️ REPLACE WITH YOUR TEST USER EMAIL
  AND us.status = 'active';

-- 📝 SAVE THESE VALUES SOMEWHERE:
-- - subscription_end_date (original value)
-- - period_end_date (original value)
-- - period_start_date (original value)
-- - You'll need these to restore the subscription after testing


-- ============================================================
-- STEP 3: SIMULATE EXPIRED YEARLY SUBSCRIPTION
-- ============================================================
-- Set the subscription_end_date to 1 day in the past to simulate
-- an expired yearly subscription

-- ⚠️ WARNING: Only do this on a test user in development/staging!

UPDATE user_subscriptions
SET
  subscription_end_date = NOW() - INTERVAL '1 day',  -- Set to yesterday
  updated_at = NOW()
WHERE user_id = (
  SELECT id FROM profiles WHERE email = 'test@example.com'  -- ⚠️ REPLACE WITH YOUR TEST USER EMAIL
)
AND status = 'active'
AND billing_cycle = 'yearly';

-- Verify the change
SELECT
  p.email,
  us.subscription_end_date,
  us.period_end_date,
  us.status,
  NOW() as current_time,
  CASE
    WHEN us.subscription_end_date < NOW() THEN '✅ EXPIRED (should be downgraded)'
    ELSE '❌ NOT EXPIRED YET'
  END as expiration_status
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
WHERE p.email = 'test@example.com'  -- ⚠️ REPLACE WITH YOUR TEST USER EMAIL
  AND us.billing_cycle = 'yearly';


-- ============================================================
-- STEP 4: MANUALLY TRIGGER EXPIRATION FUNCTION
-- ============================================================
-- Run the expiration function that normally runs via cron job daily

SELECT expire_yearly_subscriptions();

-- This function will:
-- 1. Find all yearly subscriptions where subscription_end_date < NOW()
-- 2. Mark them as 'expired'
-- 3. Create a new 'active' subscription with free tier
-- 4. Set period dates for the free tier


-- ============================================================
-- STEP 5: VERIFY THE USER WAS DOWNGRADED TO FREE TIER
-- ============================================================

-- Check the user's current active subscription
SELECT
  p.email,
  st.display_name as current_tier,
  us.status,
  us.billing_cycle,
  us.tokens_used_current_period,
  st.token_limit as free_tier_token_limit,
  us.period_start_date,
  us.period_end_date,
  us.created_at as subscription_created
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE p.email = 'test@example.com'  -- ⚠️ REPLACE WITH YOUR TEST USER EMAIL
  AND us.status = 'active';

-- Expected Result:
-- ✅ current_tier: 'Free'
-- ✅ status: 'active'
-- ✅ billing_cycle: 'monthly'
-- ✅ token_limit: 50000
-- ✅ tokens_used_current_period: 0 (reset to 0)


-- Check the old expired subscription
SELECT
  p.email,
  st.display_name as expired_tier,
  us.status,
  us.billing_cycle,
  us.subscription_end_date,
  us.updated_at as expired_at
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE p.email = 'test@example.com'  -- ⚠️ REPLACE WITH YOUR TEST USER EMAIL
  AND us.status = 'expired'
ORDER BY us.updated_at DESC
LIMIT 1;

-- Expected Result:
-- ✅ expired_tier: 'Student Package' (or whatever tier they had)
-- ✅ status: 'expired'
-- ✅ billing_cycle: 'yearly'


-- ============================================================
-- STEP 6: TEST USER EXPERIENCE
-- ============================================================

-- 1. Log in as the test user in the application
-- 2. Go to their profile (User Profile Modal)
-- 3. Check the Subscription tab
-- 4. Expected results:
--    ✅ Should show "Free" tier
--    ✅ Tokens: 0 / 50,000
--    ✅ Papers: 0 / 2
--    ✅ No yearly plan end date shown (free tier doesn't have it)

-- 5. Try to use the chat assistant
-- 6. Expected results:
--    ✅ User should have free tier limits (50K tokens per month)

-- 7. Try to access a paper
-- 8. Expected results:
--    ✅ User should only be able to access 2 papers (free tier limit)


-- ============================================================
-- STEP 7: CHECK PAYMENT HISTORY (OPTIONAL)
-- ============================================================

-- View the user's payment history to confirm their original purchase
SELECT
  p.email,
  pt.amount,
  pt.currency,
  pt.billing_cycle,
  pt.status,
  st.display_name as tier_purchased,
  pt.created_at as payment_date
FROM payment_transactions pt
JOIN profiles p ON pt.user_id = p.id
JOIN subscription_tiers st ON pt.tier_id = st.id
WHERE p.email = 'test@example.com'  -- ⚠️ REPLACE WITH YOUR TEST USER EMAIL
ORDER BY pt.created_at DESC;

-- This should still show their original yearly payment as 'completed'


-- ============================================================
-- STEP 8: RESTORE ORIGINAL SUBSCRIPTION (OPTIONAL)
-- ============================================================
-- If you want to restore the test user back to their original subscription
-- Use the values you saved in STEP 2

-- First, delete the free tier subscription created during testing
DELETE FROM user_subscriptions
WHERE user_id = (
  SELECT id FROM profiles WHERE email = 'test@example.com'  -- ⚠️ REPLACE WITH YOUR TEST USER EMAIL
)
AND status = 'active'
AND tier_id = (SELECT id FROM subscription_tiers WHERE name = 'free');

-- Then, restore the original subscription
UPDATE user_subscriptions
SET
  status = 'active',
  subscription_end_date = NOW() + INTERVAL '1 year',  -- ⚠️ OR USE ORIGINAL VALUE FROM STEP 2
  period_end_date = NOW() + INTERVAL '1 month',       -- ⚠️ OR USE ORIGINAL VALUE FROM STEP 2
  period_start_date = NOW(),                          -- ⚠️ OR USE ORIGINAL VALUE FROM STEP 2
  tokens_used_current_period = 0,                     -- Reset tokens
  updated_at = NOW()
WHERE user_id = (
  SELECT id FROM profiles WHERE email = 'test@example.com'  -- ⚠️ REPLACE WITH YOUR TEST USER EMAIL
)
AND status = 'expired'
AND billing_cycle = 'yearly';

-- Verify restoration
SELECT
  p.email,
  st.display_name as tier,
  us.status,
  us.subscription_end_date,
  us.period_end_date
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE p.email = 'test@example.com'  -- ⚠️ REPLACE WITH YOUR TEST USER EMAIL
  AND us.status = 'active';


-- ============================================================
-- ALTERNATIVE: TEST WITH MULTIPLE EXPIRATION SCENARIOS
-- ============================================================

-- Scenario 1: Subscription expired yesterday
UPDATE user_subscriptions
SET subscription_end_date = NOW() - INTERVAL '1 day'
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test@example.com')
AND status = 'active' AND billing_cycle = 'yearly';

-- Scenario 2: Subscription expired 30 days ago
UPDATE user_subscriptions
SET subscription_end_date = NOW() - INTERVAL '30 days'
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test@example.com')
AND status = 'active' AND billing_cycle = 'yearly';

-- Scenario 3: Subscription expires in 7 days (should NOT be expired yet)
UPDATE user_subscriptions
SET subscription_end_date = NOW() + INTERVAL '7 days'
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test@example.com')
AND status = 'active' AND billing_cycle = 'yearly';

-- Then run the expiration function for each scenario:
SELECT expire_yearly_subscriptions();


-- ============================================================
-- TESTING CHECKLIST
-- ============================================================

-- ✅ Step 1: Found test user with yearly subscription
-- ✅ Step 2: Backed up original subscription data
-- ✅ Step 3: Set subscription_end_date to past date
-- ✅ Step 4: Ran expire_yearly_subscriptions() function
-- ✅ Step 5: Verified user has free tier subscription
-- ✅ Step 6: Tested user experience in application
-- ✅ Step 7: Checked payment history (optional)
-- ✅ Step 8: Restored original subscription (optional)


-- ============================================================
-- EXPECTED BEHAVIOR SUMMARY
-- ============================================================

-- BEFORE EXPIRATION:
-- - User has yearly subscription (e.g., Student Package)
-- - subscription_end_date is in the future
-- - User has monthly token allocations (e.g., 500K tokens/month)
-- - User can access unlimited papers (if not free tier)

-- AFTER RUNNING expire_yearly_subscriptions():
-- - Old subscription marked as 'expired'
-- - New 'active' subscription created with 'free' tier
-- - User downgraded to free tier limits:
--   * 50,000 tokens per month
--   * 2 papers maximum
--   * No grade/subject restrictions
-- - Token usage reset to 0
-- - New period dates set (monthly)

-- USER EXPERIENCE:
-- - User sees "Free" tier in their profile
-- - No yearly plan end date shown (only free tier billing period)
-- - Token limit reduced to 50,000
-- - Paper limit reduced to 2
-- - If user wants to continue, they need to purchase a new subscription


-- ============================================================
-- TROUBLESHOOTING
-- ============================================================

-- Issue: expire_yearly_subscriptions() returns "Expired 0 yearly subscriptions"
-- Solution: Check that subscription_end_date is actually in the past:
SELECT
  p.email,
  us.subscription_end_date,
  NOW() as current_time,
  us.subscription_end_date < NOW() as is_expired
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
WHERE us.billing_cycle = 'yearly' AND us.status = 'active';

-- Issue: User still shows old tier after expiration
-- Solution: The unique constraint on active subscriptions means there can only be
-- one active subscription per user. Check for conflicts:
SELECT
  p.email,
  st.display_name,
  us.status,
  us.created_at
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE p.email = 'test@example.com'
ORDER BY us.created_at DESC;

-- If there are multiple active subscriptions, manually fix:
-- (This shouldn't happen, but just in case)
UPDATE user_subscriptions
SET status = 'expired'
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test@example.com')
AND status = 'active'
AND billing_cycle = 'yearly';

-- Then create free tier subscription manually:
INSERT INTO user_subscriptions (
  user_id, tier_id, status, billing_cycle, is_recurring,
  period_start_date, period_end_date,
  tokens_used_current_period, papers_accessed_current_period
)
SELECT
  p.id,
  (SELECT id FROM subscription_tiers WHERE name = 'free'),
  'active',
  'monthly',
  FALSE,
  NOW(),
  NOW() + INTERVAL '30 days',
  0,
  0
FROM profiles p
WHERE p.email = 'test@example.com'
ON CONFLICT (user_id) WHERE (status = 'active') DO NOTHING;


-- ============================================================
-- CLEAN UP TEST DATA (OPTIONAL)
-- ============================================================

-- If you want to completely reset the test user's subscription history:
-- ⚠️ WARNING: This will delete ALL subscription records for this user!

-- Uncomment to use:
-- DELETE FROM user_subscriptions
-- WHERE user_id = (SELECT id FROM profiles WHERE email = 'test@example.com');

-- Then create a fresh free tier subscription:
-- INSERT INTO user_subscriptions (
--   user_id, tier_id, status, billing_cycle, is_recurring,
--   period_start_date, period_end_date,
--   tokens_used_current_period, papers_accessed_current_period
-- )
-- SELECT
--   p.id,
--   (SELECT id FROM subscription_tiers WHERE name = 'free'),
--   'active',
--   'monthly',
--   FALSE,
--   NOW(),
--   NOW() + INTERVAL '30 days',
--   0,
--   0
-- FROM profiles p
-- WHERE p.email = 'test@example.com';


-- ============================================================
-- NOTES
-- ============================================================

-- 1. This test simulates what the cron job does automatically every day
--    at 00:15 UTC via the 'expire-yearly-subscriptions-daily' job

-- 2. In production, the expiration happens automatically without
--    manual intervention

-- 3. Users receive a free tier subscription after their yearly
--    subscription expires, so they don't lose access completely

-- 4. Users can always purchase a new subscription to upgrade again

-- 5. Payment history is preserved even after subscription expiration

-- 6. The expire_yearly_subscriptions() function is idempotent -
--    running it multiple times won't cause issues


-- ============================================================
-- END OF TEST GUIDE
-- ============================================================
