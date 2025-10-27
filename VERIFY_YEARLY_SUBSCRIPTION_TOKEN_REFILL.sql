-- ============================================================
-- VERIFY YEARLY SUBSCRIPTION MONTHLY TOKEN REFILL SYSTEM
-- ============================================================
-- This file contains queries to verify that the monthly token
-- refill system for yearly subscriptions is working correctly.
-- ============================================================

-- ============================================================
-- 1. CHECK ALL YEARLY SUBSCRIPTIONS
-- ============================================================
-- View all active yearly subscriptions with their dates and token usage
SELECT
  us.id as subscription_id,
  p.email,
  p.first_name,
  p.last_name,
  st.display_name as tier,
  us.billing_cycle,
  us.status,
  us.is_recurring,

  -- Token usage
  us.tokens_used_current_period,
  COALESCE(us.token_limit_override, st.token_limit) as token_limit,
  CASE
    WHEN COALESCE(us.token_limit_override, st.token_limit) IS NULL THEN 'Unlimited'
    ELSE (COALESCE(us.token_limit_override, st.token_limit) - us.tokens_used_current_period)::TEXT
  END as tokens_remaining,

  -- Important dates
  us.period_start_date as current_period_start,
  us.period_end_date as current_period_end,
  us.subscription_end_date as subscription_expires,

  -- Time until next reset
  CASE
    WHEN us.period_end_date IS NOT NULL THEN
      EXTRACT(EPOCH FROM (us.period_end_date - NOW())) / 86400
    ELSE NULL
  END as days_until_token_reset,

  -- Time until subscription expires
  CASE
    WHEN us.subscription_end_date IS NOT NULL THEN
      EXTRACT(EPOCH FROM (us.subscription_end_date - NOW())) / 86400
    ELSE NULL
  END as days_until_subscription_expires,

  -- Payment info
  us.amount_paid,
  us.currency,
  us.payment_provider,
  us.created_at as subscription_created
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.status = 'active'
ORDER BY us.subscription_end_date, us.period_end_date;


-- ============================================================
-- 2. CHECK WHICH SUBSCRIPTIONS NEED TOKEN RESET
-- ============================================================
-- Identify subscriptions that should have their tokens reset
SELECT
  p.email,
  st.display_name as tier,
  us.billing_cycle,
  us.tokens_used_current_period,
  st.token_limit,
  us.period_end_date as token_reset_date,
  us.subscription_end_date,
  NOW() as current_time,

  -- Reset status
  CASE
    WHEN us.period_end_date < NOW() THEN '🔴 NEEDS RESET NOW'
    WHEN us.period_end_date < NOW() + INTERVAL '1 day' THEN '🟡 RESETS WITHIN 24 HOURS'
    WHEN us.period_end_date < NOW() + INTERVAL '7 days' THEN '🟢 RESETS WITHIN 7 DAYS'
    ELSE '⚪ OK'
  END as reset_status,

  -- Subscription status
  CASE
    WHEN us.billing_cycle = 'yearly' AND us.subscription_end_date < NOW() THEN '🔴 NEEDS EXPIRATION'
    WHEN us.billing_cycle = 'yearly' AND us.subscription_end_date < NOW() + INTERVAL '7 days' THEN '🟡 EXPIRES WITHIN 7 DAYS'
    ELSE '⚪ OK'
  END as subscription_status
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.status = 'active'
ORDER BY us.period_end_date;


-- ============================================================
-- 3. CHECK CRON JOBS
-- ============================================================
-- Verify that all cron jobs are properly scheduled
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active,
  database
FROM cron.job
WHERE jobname LIKE '%subscription%'
ORDER BY jobname;


-- ============================================================
-- 4. VIEW SUBSCRIPTION MAINTENANCE FUNCTION STATUS
-- ============================================================
-- Check if the maintenance functions exist
SELECT
  routine_name as function_name,
  routine_type as type,
  routine_definition as definition_preview
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'reset_subscription_period',
    'expire_yearly_subscriptions',
    'expire_non_recurring_subscriptions',
    'expire_cancelled_subscriptions',
    'run_subscription_maintenance'
  )
ORDER BY routine_name;


-- ============================================================
-- 5. CHECK TOKEN USAGE HISTORY
-- ============================================================
-- View token usage patterns for yearly subscriptions
SELECT
  p.email,
  st.display_name as tier,
  DATE(tul.created_at) as usage_date,
  COUNT(*) as total_requests,
  SUM(tul.total_tokens) as tokens_used,
  us.tokens_used_current_period as current_period_total
FROM token_usage_logs tul
JOIN profiles p ON tul.user_id = p.id
JOIN user_subscriptions us ON tul.user_id = us.user_id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.status = 'active'
  AND tul.created_at >= us.period_start_date
GROUP BY p.email, st.display_name, DATE(tul.created_at), us.tokens_used_current_period
ORDER BY usage_date DESC, p.email
LIMIT 50;


-- ============================================================
-- 6. CHECK PAYMENT HISTORY FOR YEARLY SUBSCRIPTIONS
-- ============================================================
-- View all yearly subscription payments
SELECT
  p.email,
  st.display_name as tier,
  pt.amount,
  pt.currency,
  pt.billing_cycle,
  pt.status as payment_status,
  pm.display_name as payment_method,
  pt.created_at as payment_date,
  us.subscription_end_date,
  CASE
    WHEN us.subscription_end_date IS NOT NULL THEN
      ROUND(EXTRACT(EPOCH FROM (us.subscription_end_date - NOW())) / 86400)
    ELSE NULL
  END as days_remaining
FROM payment_transactions pt
JOIN profiles p ON pt.user_id = p.id
JOIN subscription_tiers st ON pt.tier_id = st.id
JOIN payment_methods pm ON pt.payment_method_id = pm.id
LEFT JOIN user_subscriptions us ON pt.user_id = us.user_id AND us.status = 'active'
WHERE pt.billing_cycle = 'yearly'
  AND pt.status = 'completed'
ORDER BY pt.created_at DESC
LIMIT 20;


-- ============================================================
-- 7. VERIFY SUBSCRIPTION_END_DATE IS SET CORRECTLY
-- ============================================================
-- Check that yearly subscriptions have subscription_end_date set
SELECT
  p.email,
  st.display_name as tier,
  us.billing_cycle,
  us.created_at as subscription_created,
  us.subscription_end_date,

  -- Verify it's approximately 1 year from creation
  CASE
    WHEN us.subscription_end_date IS NULL THEN '❌ MISSING subscription_end_date'
    WHEN EXTRACT(EPOCH FROM (us.subscription_end_date - us.created_at)) / 86400 BETWEEN 360 AND 370 THEN '✅ Correctly set to ~1 year'
    ELSE '⚠️ Incorrect duration: ' || ROUND(EXTRACT(EPOCH FROM (us.subscription_end_date - us.created_at)) / 86400) || ' days'
  END as validation_status
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.status = 'active'
ORDER BY us.created_at DESC;


-- ============================================================
-- 8. CHECK EXPIRED YEARLY SUBSCRIPTIONS
-- ============================================================
-- View recently expired yearly subscriptions
SELECT
  p.email,
  st.display_name as previous_tier,
  us.status,
  us.billing_cycle,
  us.subscription_end_date as expired_on,
  us.updated_at as status_changed_at,
  EXTRACT(EPOCH FROM (NOW() - us.subscription_end_date)) / 86400 as days_since_expiration
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.status = 'expired'
ORDER BY us.updated_at DESC
LIMIT 20;


-- ============================================================
-- 9. MANUALLY TRIGGER TOKEN RESET (FOR TESTING)
-- ============================================================
-- WARNING: Only use this in development/staging environments!
-- This will reset tokens for any subscriptions past their period_end_date

-- Uncomment to run:
-- SELECT reset_subscription_period();

-- View results after running:
-- SELECT
--   p.email,
--   us.tokens_used_current_period,
--   us.period_start_date,
--   us.period_end_date,
--   us.updated_at
-- FROM user_subscriptions us
-- JOIN profiles p ON us.user_id = p.id
-- WHERE us.status = 'active'
-- ORDER BY us.updated_at DESC;


-- ============================================================
-- 10. MANUALLY TRIGGER YEARLY SUBSCRIPTION EXPIRATION (FOR TESTING)
-- ============================================================
-- WARNING: Only use this in development/staging environments!
-- This will expire yearly subscriptions past their subscription_end_date

-- Uncomment to run:
-- SELECT expire_yearly_subscriptions();

-- View results after running:
-- SELECT
--   p.email,
--   us.status,
--   st.display_name as tier,
--   us.subscription_end_date,
--   us.updated_at
-- FROM user_subscriptions us
-- JOIN profiles p ON us.user_id = p.id
-- JOIN subscription_tiers st ON us.tier_id = st.id
-- WHERE us.user_id IN (
--   SELECT user_id FROM user_subscriptions
--   WHERE status = 'expired' OR updated_at > NOW() - INTERVAL '1 minute'
-- )
-- ORDER BY us.updated_at DESC;


-- ============================================================
-- 11. RUN ALL SUBSCRIPTION MAINTENANCE TASKS (FOR TESTING)
-- ============================================================
-- This runs all maintenance functions at once
-- Safe to use in production as it only processes subscriptions
-- that are actually due for reset/expiration

-- Uncomment to run:
-- SELECT * FROM run_subscription_maintenance();


-- ============================================================
-- 12. COMPARE MONTHLY VS YEARLY SUBSCRIPTIONS
-- ============================================================
-- Side-by-side comparison of monthly and yearly subscriptions
SELECT
  us.billing_cycle,
  COUNT(*) as total_subscriptions,
  COUNT(DISTINCT us.tier_id) as unique_tiers,
  SUM(us.amount_paid) as total_revenue,
  AVG(us.tokens_used_current_period) as avg_tokens_used,

  -- Upcoming resets/expirations
  COUNT(CASE WHEN us.period_end_date < NOW() + INTERVAL '7 days' THEN 1 END) as resets_within_7_days,
  COUNT(CASE WHEN us.subscription_end_date < NOW() + INTERVAL '30 days' THEN 1 END) as expirations_within_30_days
FROM user_subscriptions us
WHERE us.status = 'active'
  AND us.billing_cycle IN ('monthly', 'yearly')
GROUP BY us.billing_cycle
ORDER BY us.billing_cycle;


-- ============================================================
-- 13. CHECK SUBSCRIPTION HEALTH
-- ============================================================
-- Overall health check of the subscription system
SELECT
  'Total Active Subscriptions' as metric,
  COUNT(*)::TEXT as value
FROM user_subscriptions
WHERE status = 'active'

UNION ALL

SELECT
  'Active Yearly Subscriptions',
  COUNT(*)::TEXT
FROM user_subscriptions
WHERE status = 'active' AND billing_cycle = 'yearly'

UNION ALL

SELECT
  'Yearly Subs Missing subscription_end_date',
  COUNT(*)::TEXT
FROM user_subscriptions
WHERE status = 'active'
  AND billing_cycle = 'yearly'
  AND subscription_end_date IS NULL

UNION ALL

SELECT
  'Subscriptions Needing Token Reset',
  COUNT(*)::TEXT
FROM user_subscriptions
WHERE status = 'active'
  AND period_end_date < NOW()

UNION ALL

SELECT
  'Yearly Subscriptions Needing Expiration',
  COUNT(*)::TEXT
FROM user_subscriptions
WHERE status = 'active'
  AND billing_cycle = 'yearly'
  AND subscription_end_date < NOW()

UNION ALL

SELECT
  'Scheduled Cron Jobs',
  COUNT(*)::TEXT
FROM cron.job
WHERE jobname LIKE '%subscription%' AND active = true;


-- ============================================================
-- 14. DETAILED VIEW OF A SPECIFIC USER (REPLACE EMAIL)
-- ============================================================
-- Replace 'user@example.com' with the actual user email
-- Uncomment to use:

-- SELECT
--   'User Info' as section,
--   p.email,
--   p.first_name,
--   p.last_name,
--   p.role,
--   NULL as value
-- FROM profiles p
-- WHERE p.email = 'user@example.com'
--
-- UNION ALL
--
-- SELECT
--   'Current Subscription',
--   st.display_name,
--   us.billing_cycle,
--   us.status::TEXT,
--   us.tokens_used_current_period::TEXT || ' / ' ||
--   COALESCE(us.token_limit_override, st.token_limit)::TEXT
-- FROM user_subscriptions us
-- JOIN profiles p ON us.user_id = p.id
-- JOIN subscription_tiers st ON us.tier_id = st.id
-- WHERE p.email = 'user@example.com' AND us.status = 'active'
--
-- UNION ALL
--
-- SELECT
--   'Period Dates',
--   'Start: ' || us.period_start_date::TEXT,
--   'End: ' || us.period_end_date::TEXT,
--   'Subscription Ends: ' || COALESCE(us.subscription_end_date::TEXT, 'N/A'),
--   'Days Until Reset: ' || ROUND(EXTRACT(EPOCH FROM (us.period_end_date - NOW())) / 86400)::TEXT
-- FROM user_subscriptions us
-- JOIN profiles p ON us.user_id = p.id
-- WHERE p.email = 'user@example.com' AND us.status = 'active';


-- ============================================================
-- SUMMARY
-- ============================================================
-- Quick summary of key metrics

\echo ''
\echo '================================================'
\echo 'YEARLY SUBSCRIPTION TOKEN REFILL SYSTEM STATUS'
\echo '================================================'
\echo ''
\echo 'Run Query #13 (CHECK SUBSCRIPTION HEALTH) for a quick overview'
\echo 'Run Query #1 (CHECK ALL YEARLY SUBSCRIPTIONS) for detailed view'
\echo ''
\echo 'To test the system:'
\echo '  1. Run Query #11 (run_subscription_maintenance)'
\echo '  2. Check Query #2 for subscriptions needing attention'
\echo '  3. Verify Query #3 shows all cron jobs are active'
\echo ''
