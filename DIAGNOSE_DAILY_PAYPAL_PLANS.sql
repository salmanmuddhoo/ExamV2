-- Diagnostic Script: Daily PayPal Plan Checkbox Issue
-- Run this to verify daily plans exist and check for potential issues

-- ============================================================================
-- 1. Check if daily plans exist in paypal_subscription_plans
-- ============================================================================
SELECT
  'Daily PayPal Plans Status' as check_name,
  psp.id as plan_db_id,
  st.id as tier_id,
  st.name as tier_name,
  st.display_name as tier_display_name,
  psp.billing_cycle,
  psp.paypal_plan_id,
  psp.price,
  psp.currency,
  psp.is_active,
  psp.created_at,
  CASE
    WHEN psp.is_active = TRUE AND psp.billing_cycle = 'daily' THEN '✅ Active daily plan'
    WHEN psp.is_active = FALSE AND psp.billing_cycle = 'daily' THEN '❌ INACTIVE daily plan (is_active = FALSE)'
    ELSE 'Not a daily plan'
  END as status
FROM paypal_subscription_plans psp
JOIN subscription_tiers st ON psp.tier_id = st.id
WHERE psp.billing_cycle = 'daily'
ORDER BY st.name;

-- ============================================================================
-- 2. Check if any plans exist for each tier (all billing cycles)
-- ============================================================================
SELECT
  'Plans Per Tier' as check_name,
  st.name as tier_name,
  st.display_name,
  COUNT(*) FILTER (WHERE psp.billing_cycle = 'daily') as daily_plans,
  COUNT(*) FILTER (WHERE psp.billing_cycle = 'monthly') as monthly_plans,
  COUNT(*) FILTER (WHERE psp.billing_cycle = 'yearly') as yearly_plans,
  COUNT(*) as total_plans
FROM subscription_tiers st
LEFT JOIN paypal_subscription_plans psp ON st.id = psp.tier_id AND psp.is_active = TRUE
WHERE st.is_active = TRUE
GROUP BY st.id, st.name, st.display_name
ORDER BY st.display_order;

-- ============================================================================
-- 3. Verify tier IDs match what the frontend is sending
-- ============================================================================
-- This shows the exact tier_id values that should be used in queries
SELECT
  'Tier ID Reference' as check_name,
  id as tier_id,
  name as tier_name,
  display_name as tier_display_name,
  is_active
FROM subscription_tiers
WHERE is_active = TRUE
ORDER BY display_order;

-- ============================================================================
-- 4. Check for any plans where is_active = FALSE
-- ============================================================================
SELECT
  'Inactive Plans (is_active = FALSE)' as check_name,
  st.name as tier_name,
  psp.billing_cycle,
  psp.paypal_plan_id,
  psp.is_active,
  psp.created_at,
  '❌ This plan is INACTIVE and will not show in the UI' as issue
FROM paypal_subscription_plans psp
JOIN subscription_tiers st ON psp.tier_id = st.id
WHERE psp.is_active = FALSE
ORDER BY st.name, psp.billing_cycle;

-- ============================================================================
-- 5. Test the exact query the frontend uses
-- ============================================================================
-- Replace 'YOUR_TIER_ID_HERE' with the actual tier ID from query #3
-- Replace 'daily' with the billing_cycle you're testing
--
-- Example:
-- SELECT * FROM paypal_subscription_plans
-- WHERE tier_id = 'a1b2c3d4-...'
--   AND billing_cycle = 'daily'
--   AND is_active = true;

-- ============================================================================
-- 6. Check billing_cycle constraint
-- ============================================================================
SELECT
  'Billing Cycle Constraint' as check_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'paypal_subscription_plans'::regclass
  AND conname LIKE '%billing_cycle%';

-- ============================================================================
-- 7. Show sample daily plan with full details
-- ============================================================================
SELECT
  'Sample Daily Plan Details' as check_name,
  psp.*,
  st.name as tier_name,
  st.display_name as tier_display_name
FROM paypal_subscription_plans psp
JOIN subscription_tiers st ON psp.tier_id = st.id
WHERE psp.billing_cycle = 'daily'
  AND psp.is_active = TRUE
LIMIT 1;

-- ============================================================================
-- INSTRUCTIONS:
-- ============================================================================
-- 1. Run all queries above in Supabase SQL Editor
-- 2. Check if Query #1 returns any daily plans
-- 3. Verify is_active = TRUE for daily plans in Query #1
-- 4. Note the tier_id from Query #3 for your tier
-- 5. Compare with what the browser console logs show
-- 6. If plans exist but checkbox is unchecked, check browser console logs
-- 7. The console will show exactly what tier_id and billing_cycle are being queried
-- ============================================================================
