-- Manual fix: Award referral points for the subscription that was missed
-- This is a one-time fix for subscription: 3c8532f4-0c6f-4d3c-aace-c40d75a6dcab
-- User: 18f825d7-f8fd-44d8-adf6-f1de71ba8b22
-- Payment was completed but trigger didn't fire due to the bug

-- Simply call the award_referral_points function manually
-- This will check all conditions and award points if appropriate
SELECT award_referral_points('3c8532f4-0c6f-4d3c-aace-c40d75a6dcab');

-- Check the log to see if points were awarded
SELECT
  created_at,
  tier_name,
  referral_points_awarded,
  status,
  reason,
  referrer_id
FROM referral_points_log
WHERE subscription_id = '3c8532f4-0c6f-4d3c-aace-c40d75a6dcab'
ORDER BY created_at DESC;

-- Check the referral status
SELECT
  status,
  points_awarded,
  completed_at
FROM referrals
WHERE referred_id = '18f825d7-f8fd-44d8-adf6-f1de71ba8b22';
