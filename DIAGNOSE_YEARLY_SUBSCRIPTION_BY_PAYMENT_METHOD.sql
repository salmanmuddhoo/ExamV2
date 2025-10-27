-- ============================================================
-- DIAGNOSE YEARLY SUBSCRIPTION ISSUES ACROSS PAYMENT PROVIDERS
-- ============================================================
-- This script checks if yearly subscriptions are working correctly
-- for all payment providers (Stripe, MCB Juice, PayPal)
-- ============================================================

-- ============================================================
-- 1. CHECK ALL YEARLY SUBSCRIPTIONS BY PAYMENT PROVIDER
-- ============================================================

SELECT
  pm.display_name as payment_method,
  us.payment_provider,
  COUNT(*) as total_yearly_subs,
  COUNT(CASE WHEN us.subscription_end_date IS NOT NULL THEN 1 END) as with_end_date,
  COUNT(CASE WHEN us.subscription_end_date IS NULL THEN 1 END) as missing_end_date,
  COUNT(CASE WHEN us.period_end_date <= us.period_start_date + INTERVAL '35 days' THEN 1 END) as monthly_reset_period
FROM user_subscriptions us
LEFT JOIN payment_transactions pt ON pt.user_id = us.user_id AND pt.status = 'completed'
LEFT JOIN payment_methods pm ON us.payment_provider = pm.name
WHERE us.billing_cycle = 'yearly'
  AND us.status = 'active'
GROUP BY pm.display_name, us.payment_provider
ORDER BY payment_method;

-- Expected for ALL payment providers:
-- ✅ with_end_date should equal total_yearly_subs (all have subscription_end_date)
-- ✅ monthly_reset_period should equal total_yearly_subs (period_end_date is ~1 month from start)


-- ============================================================
-- 2. CHECK SPECIFIC YEARLY SUBSCRIPTIONS WITH DETAILS
-- ============================================================

SELECT
  p.email,
  st.display_name as tier,
  us.payment_provider,
  us.billing_cycle,
  us.is_recurring,

  -- Check dates
  us.period_start_date,
  us.period_end_date,
  us.subscription_end_date,

  -- Validate dates
  CASE
    WHEN us.subscription_end_date IS NULL THEN '❌ MISSING subscription_end_date'
    WHEN us.subscription_end_date <= NOW() THEN '❌ ALREADY EXPIRED'
    WHEN us.subscription_end_date > NOW() + INTERVAL '13 months' THEN '⚠️ TOO FAR IN FUTURE (>13 months)'
    WHEN us.subscription_end_date < NOW() + INTERVAL '11 months' THEN '⚠️ TOO SOON (<11 months)'
    ELSE '✅ CORRECT (within 11-13 months)'
  END as subscription_end_validation,

  CASE
    WHEN us.period_end_date IS NULL THEN '❌ MISSING period_end_date'
    WHEN us.period_end_date > us.period_start_date + INTERVAL '35 days' THEN '❌ TOO LONG (>35 days)'
    WHEN us.period_end_date < us.period_start_date + INTERVAL '25 days' THEN '❌ TOO SHORT (<25 days)'
    ELSE '✅ CORRECT (~1 month)'
  END as period_end_validation,

  -- Show actual durations
  ROUND(EXTRACT(EPOCH FROM (us.subscription_end_date - NOW())) / 86400) as days_until_subscription_expires,
  ROUND(EXTRACT(EPOCH FROM (us.period_end_date - us.period_start_date)) / 86400) as period_length_days,

  us.created_at as subscription_created
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.status = 'active'
ORDER BY us.payment_provider, us.created_at DESC;


-- ============================================================
-- 3. CHECK PAYMENT TRANSACTIONS FOR YEARLY SUBSCRIPTIONS
-- ============================================================

SELECT
  p.email,
  pm.display_name as payment_method,
  st.display_name as tier,
  pt.billing_cycle,
  pt.amount,
  pt.currency,
  pt.status,
  pt.created_at as payment_date,
  pt.approved_at,

  -- Check if subscription was created
  CASE
    WHEN us.id IS NOT NULL THEN '✅ Subscription created'
    ELSE '❌ NO SUBSCRIPTION FOUND'
  END as subscription_status,

  -- Check subscription dates
  us.subscription_end_date,
  us.period_end_date
FROM payment_transactions pt
JOIN profiles p ON pt.user_id = p.id
JOIN payment_methods pm ON pt.payment_method_id = pm.id
JOIN subscription_tiers st ON pt.tier_id = st.id
LEFT JOIN user_subscriptions us ON pt.user_id = us.user_id
  AND us.status = 'active'
  AND us.billing_cycle = 'yearly'
WHERE pt.billing_cycle = 'yearly'
  AND pt.status = 'completed'
ORDER BY pt.created_at DESC
LIMIT 20;


-- ============================================================
-- 4. CHECK IF handle_successful_payment TRIGGER IS WORKING
-- ============================================================

-- This checks if the trigger exists and is enabled
SELECT
  trigger_name,
  event_object_table,
  action_statement,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_name = 'on_payment_completed';

-- Expected: Should show the trigger with AFTER INSERT OR UPDATE


-- ============================================================
-- 5. CHECK FOR YEARLY SUBS WITH INCORRECT DATES
-- ============================================================

-- Find yearly subscriptions that are MISSING subscription_end_date
SELECT
  p.email,
  us.payment_provider,
  st.display_name as tier,
  us.created_at,
  us.subscription_end_date,
  '❌ ISSUE: Missing subscription_end_date' as issue
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.status = 'active'
  AND us.subscription_end_date IS NULL;

-- Find yearly subscriptions with WRONG period_end_date (not ~1 month)
SELECT
  p.email,
  us.payment_provider,
  st.display_name as tier,
  us.period_start_date,
  us.period_end_date,
  ROUND(EXTRACT(EPOCH FROM (us.period_end_date - us.period_start_date)) / 86400) as period_length_days,
  '❌ ISSUE: Period length should be ~30 days' as issue
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.status = 'active'
  AND (
    us.period_end_date > us.period_start_date + INTERVAL '35 days'
    OR us.period_end_date < us.period_start_date + INTERVAL '25 days'
  );


-- ============================================================
-- 6. CHECK RECENT COMPLETED PAYMENTS (ALL BILLING CYCLES)
-- ============================================================

SELECT
  p.email,
  pm.display_name as payment_method,
  st.display_name as tier,
  pt.billing_cycle,
  pt.status,
  pt.created_at as payment_date,
  pt.approved_at,

  -- Check if subscription exists
  CASE
    WHEN us.id IS NOT NULL THEN '✅ Has active subscription'
    ELSE '❌ NO ACTIVE SUBSCRIPTION'
  END as has_subscription,

  us.subscription_end_date,
  us.period_end_date
FROM payment_transactions pt
JOIN profiles p ON pt.user_id = p.id
JOIN payment_methods pm ON pt.payment_method_id = pm.id
JOIN subscription_tiers st ON pt.tier_id = st.id
LEFT JOIN user_subscriptions us ON pt.user_id = us.user_id AND us.status = 'active'
WHERE pt.status = 'completed'
ORDER BY pt.created_at DESC
LIMIT 10;


-- ============================================================
-- 7. FIX YEARLY SUBSCRIPTIONS WITH MISSING subscription_end_date
-- ============================================================

-- This will fix any yearly subscriptions that are missing subscription_end_date
-- Run this if Query #5 found issues

-- UNCOMMENT TO FIX:
-- UPDATE user_subscriptions
-- SET
--   subscription_end_date = period_start_date + INTERVAL '1 year',
--   period_end_date = period_start_date + INTERVAL '1 month',
--   updated_at = NOW()
-- WHERE billing_cycle = 'yearly'
--   AND status = 'active'
--   AND subscription_end_date IS NULL;


-- ============================================================
-- 8. TEST THE TRIGGER MANUALLY
-- ============================================================

-- Create a test yearly payment transaction and see if subscription is created correctly
-- WARNING: Only run in development/test environment!

-- Step 1: Create a test transaction (UNCOMMENT TO USE):
-- INSERT INTO payment_transactions (
--   user_id,
--   tier_id,
--   payment_method_id,
--   amount,
--   currency,
--   billing_cycle,
--   status
-- )
-- SELECT
--   (SELECT id FROM profiles WHERE email = 'test@example.com' LIMIT 1),
--   (SELECT id FROM subscription_tiers WHERE name = 'student' LIMIT 1),
--   (SELECT id FROM payment_methods WHERE name = 'stripe' LIMIT 1),
--   150,
--   'USD',
--   'yearly',
--   'pending'
-- RETURNING id;

-- Step 2: Approve the transaction (replace TRANSACTION_ID):
-- UPDATE payment_transactions
-- SET status = 'completed'
-- WHERE id = 'TRANSACTION_ID';

-- Step 3: Check if subscription was created:
-- SELECT
--   us.billing_cycle,
--   us.subscription_end_date,
--   us.period_end_date,
--   us.period_start_date
-- FROM user_subscriptions us
-- WHERE us.user_id = (SELECT id FROM profiles WHERE email = 'test@example.com')
--   AND us.status = 'active';

-- Expected: subscription_end_date should be ~1 year from now, period_end_date should be ~1 month from now


-- ============================================================
-- SUMMARY
-- ============================================================

/*
WHAT TO LOOK FOR:

1. Query #1: Check if all yearly subs have subscription_end_date set
   - If missing_end_date > 0, there's an issue

2. Query #2: Look for validation issues (❌ or ⚠️)
   - All should show ✅ CORRECT

3. Query #3: Check if subscriptions were created after payment
   - All completed payments should have "✅ Subscription created"

4. Query #4: Verify trigger exists and is enabled

5. Query #5: Find specific issues with dates

6. Query #7: Run this to fix any issues found

COMMON ISSUES:

Issue: MCB Juice yearly subscriptions missing subscription_end_date
Cause: Old version of handle_successful_payment() function was used
Solution: Run the latest migration and use Query #7 to fix existing data

Issue: PayPal yearly subscriptions have wrong period_end_date
Cause: Same as above
Solution: Same as above

Issue: Trigger not firing
Cause: Trigger might have been dropped or disabled
Solution: Re-run the migration to recreate the trigger
*/
