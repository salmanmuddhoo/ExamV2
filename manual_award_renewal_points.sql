-- Manual script to award points for missed renewal
-- Run this AFTER applying the migration 20251127000010_award_points_on_renewals.sql

-- Step 1: Find the user who renewed and their subscription
-- Replace with actual user_id if you know it
-- This query helps you find the subscription_id for the renewal

SELECT
  us.id as subscription_id,
  us.user_id,
  p.email,
  p.first_name,
  p.last_name,
  st.name as tier_name,
  st.referral_points_awarded,
  us.created_at as subscription_created,
  r.referrer_id,
  r.times_awarded
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
LEFT JOIN referrals r ON r.referred_id = us.user_id
WHERE us.status = 'active'
  AND st.name != 'free'
  AND r.id IS NOT NULL  -- User was referred
ORDER BY us.created_at DESC
LIMIT 10;

-- Step 2: Award points for the renewal
-- Replace 'YOUR_SUBSCRIPTION_ID_HERE' with the actual subscription_id from Step 1
-- Example: SELECT award_referral_points('3c8532f4-0c6f-4d3c-aace-c40d75a6dcab');

-- SELECT award_referral_points('YOUR_SUBSCRIPTION_ID_HERE');

-- Step 3: Verify points were awarded
-- SELECT
--   created_at,
--   tier_name,
--   referral_points_awarded,
--   status,
--   reason
-- FROM referral_points_log
-- WHERE subscription_id = 'YOUR_SUBSCRIPTION_ID_HERE'
-- ORDER BY created_at DESC;

-- Step 4: Check referrer's updated balance
-- SELECT
--   points_balance,
--   total_earned,
--   successful_referrals
-- FROM user_referral_points
-- WHERE user_id = (
--   SELECT referrer_id FROM referrals WHERE referred_id = 'YOUR_USER_ID_HERE'
-- );
