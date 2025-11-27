-- Debug script for referral points issue
-- Run these queries to understand what happened

-- 1. Check the subscription details
SELECT
  us.id as subscription_id,
  us.user_id,
  us.status as subscription_status,
  st.name as tier_name,
  st.display_name,
  st.referral_points_awarded,
  us.created_at as subscription_created,
  us.updated_at as subscription_updated
FROM user_subscriptions us
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.id = '3c8532f4-0c6f-4d3c-aace-c40d75a6dcab';

-- 2. Check payment transactions for this user
SELECT
  pt.id as transaction_id,
  pt.user_id,
  pt.status as payment_status,
  pt.amount,
  pt.currency,
  st.name as tier_purchased,
  st.display_name,
  pm.display_name as payment_method,
  pm.requires_manual_approval,
  pt.created_at as payment_created,
  pt.updated_at as payment_updated
FROM payment_transactions pt
JOIN subscription_tiers st ON pt.tier_id = st.id
JOIN payment_methods pm ON pt.payment_method_id = pm.id
WHERE pt.user_id = '18f825d7-f8fd-44d8-adf6-f1de71ba8b22'
ORDER BY pt.created_at DESC
LIMIT 5;

-- 3. Check if this user was referred
SELECT
  r.id as referral_id,
  r.referrer_id,
  r.referred_id,
  r.referral_code,
  r.status as referral_status,
  r.points_awarded,
  p1.first_name || ' ' || p1.last_name as referrer_name,
  p1.email as referrer_email,
  p2.first_name || ' ' || p2.last_name as referred_name,
  p2.email as referred_email,
  r.created_at as referral_created,
  r.completed_at as referral_completed
FROM referrals r
JOIN profiles p1 ON r.referrer_id = p1.id
JOIN profiles p2 ON r.referred_id = p2.id
WHERE r.referred_id = '18f825d7-f8fd-44d8-adf6-f1de71ba8b22';

-- 4. Check the referral points awarded values for each tier
SELECT
  name,
  display_name,
  referral_points_awarded,
  points_cost
FROM subscription_tiers
ORDER BY display_order;

-- 5. Check all referral points log entries for context
SELECT
  created_at,
  tier_name,
  referral_points_awarded,
  status,
  reason,
  subscription_id,
  user_id,
  referrer_id
FROM referral_points_log
ORDER BY created_at DESC
LIMIT 10;
