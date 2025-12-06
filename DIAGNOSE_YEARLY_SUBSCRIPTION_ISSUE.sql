-- Diagnostic script to investigate yearly subscription downgrade issue
-- Run this to identify why yearly MCB Juice subscriptions are being downgraded to free tier

-- 1. Check all active yearly subscriptions
SELECT
  'Active Yearly Subscriptions' as check_name,
  p.email,
  st.name as tier_name,
  us.billing_cycle,
  us.is_recurring,
  us.payment_provider,
  us.period_start_date,
  us.period_end_date,
  us.subscription_end_date,
  ROUND(EXTRACT(EPOCH FROM (us.period_end_date - NOW())) / 86400) as days_until_period_end,
  ROUND(EXTRACT(EPOCH FROM (us.subscription_end_date - NOW())) / 86400) as days_until_subscription_end,
  CASE
    WHEN us.billing_cycle = 'yearly' AND us.is_recurring = TRUE AND us.subscription_end_date IS NOT NULL THEN '✅ CORRECT'
    WHEN us.billing_cycle = 'yearly' AND us.is_recurring = FALSE THEN '❌ WRONG: is_recurring should be TRUE for yearly'
    WHEN us.billing_cycle = 'yearly' AND us.subscription_end_date IS NULL THEN '❌ WRONG: subscription_end_date missing'
    ELSE 'N/A (not yearly)'
  END as status_check
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.status = 'active' AND us.billing_cycle = 'yearly'
ORDER BY us.created_at DESC;

-- 2. Check recently expired subscriptions that were yearly
SELECT
  'Recently Expired Yearly Subscriptions' as check_name,
  p.email,
  st.name as tier_name,
  us.billing_cycle,
  us.is_recurring,
  us.payment_provider,
  us.status,
  us.period_end_date,
  us.subscription_end_date,
  us.updated_at,
  CASE
    WHEN us.subscription_end_date IS NULL THEN '❌ subscription_end_date was never set'
    WHEN us.subscription_end_date > NOW() THEN '❌ WRONG: Expired too early (subscription_end_date not yet reached)'
    ELSE '✅ Expired correctly'
  END as expiration_check
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE
  us.status IN ('expired', 'cancelled')
  AND us.billing_cycle = 'yearly'
  AND us.updated_at > NOW() - INTERVAL '30 days'  -- Last 30 days
ORDER BY us.updated_at DESC;

-- 3. Check user subscriptions history to see if yearly subscription was downgraded
-- Look for users who had yearly subscription and now have free tier
SELECT
  'Users Downgraded from Yearly' as check_name,
  p.email,
  us_old.billing_cycle as old_billing_cycle,
  st_old.name as old_tier,
  us_old.status as old_status,
  us_old.is_recurring as old_is_recurring,
  us_old.subscription_end_date as old_subscription_end_date,
  us_old.period_end_date as old_period_end_date,
  us_old.updated_at as old_updated_at,
  st_new.name as current_tier,
  us_new.status as current_status,
  CASE
    WHEN us_old.subscription_end_date IS NULL THEN '❌ subscription_end_date was never set'
    WHEN us_old.is_recurring = FALSE THEN '❌ is_recurring was FALSE (should be TRUE for yearly)'
    WHEN us_old.subscription_end_date > NOW() THEN '❌ WRONG: Downgraded too early'
    ELSE '✅ Downgraded correctly'
  END as downgrade_check
FROM user_subscriptions us_new
JOIN profiles p ON us_new.user_id = p.id
JOIN subscription_tiers st_new ON us_new.tier_id = st_new.id
LEFT JOIN LATERAL (
  SELECT *
  FROM user_subscriptions us_prev
  WHERE us_prev.user_id = us_new.user_id
    AND us_prev.status IN ('expired', 'cancelled')
    AND us_prev.billing_cycle = 'yearly'
    AND us_prev.updated_at > NOW() - INTERVAL '60 days'
  ORDER BY us_prev.updated_at DESC
  LIMIT 1
) us_old ON TRUE
LEFT JOIN subscription_tiers st_old ON us_old.tier_id = st_old.id
WHERE
  us_new.status = 'active'
  AND st_new.name = 'free'
  AND us_old.id IS NOT NULL
ORDER BY us_old.updated_at DESC;

-- 4. Check the current definition of expire_non_recurring_subscriptions
-- to ensure it's not expiring yearly subscriptions
SELECT
  'expire_non_recurring_subscriptions Function Check' as check_name,
  pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'expire_non_recurring_subscriptions'
LIMIT 1;

-- 5. Check if there are any yearly subscriptions about to be incorrectly expired
SELECT
  'Yearly Subscriptions At Risk' as check_name,
  p.email,
  st.name as tier_name,
  us.billing_cycle,
  us.is_recurring,
  us.payment_provider,
  us.period_end_date,
  us.subscription_end_date,
  ROUND(EXTRACT(EPOCH FROM (us.period_end_date - NOW())) / 86400) as days_until_period_end,
  ROUND(EXTRACT(EPOCH FROM (us.subscription_end_date - NOW())) / 86400) as days_until_subscription_end,
  CASE
    WHEN us.is_recurring = FALSE THEN '🚨 CRITICAL: Will be expired by expire_non_recurring_subscriptions()'
    WHEN us.subscription_end_date IS NULL THEN '⚠️ WARNING: No subscription_end_date set'
    WHEN us.period_end_date < NOW() THEN '⚠️ WARNING: period_end_date has passed (needs token reset)'
    ELSE '✅ OK'
  END as risk_assessment
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE
  us.status = 'active'
  AND us.billing_cycle = 'yearly'
  AND (
    us.is_recurring = FALSE
    OR us.subscription_end_date IS NULL
    OR us.period_end_date < NOW()
  )
ORDER BY
  CASE
    WHEN us.is_recurring = FALSE THEN 1
    WHEN us.subscription_end_date IS NULL THEN 2
    ELSE 3
  END;
