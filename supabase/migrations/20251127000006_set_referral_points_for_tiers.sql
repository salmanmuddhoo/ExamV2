-- Set referral points values for subscription tiers
-- Points awarded when someone purchases via referral, and points needed to redeem

-- Student Lite: Award 100 points, costs 1000 points to redeem (10 referrals)
UPDATE subscription_tiers
SET
  referral_points_awarded = 100,
  points_cost = 1000
WHERE name = 'student_lite';

-- Student: Award 150 points, costs 1500 points to redeem (10 referrals)
UPDATE subscription_tiers
SET
  referral_points_awarded = 150,
  points_cost = 1500
WHERE name = 'student';

-- Pro: Award 250 points, costs 2500 points to redeem (10 referrals)
UPDATE subscription_tiers
SET
  referral_points_awarded = 250,
  points_cost = 2500
WHERE name = 'pro';

-- Free tier: No points awarded or needed (it's already free)
UPDATE subscription_tiers
SET
  referral_points_awarded = 0,
  points_cost = 0
WHERE name = 'free';

COMMENT ON COLUMN subscription_tiers.referral_points_awarded IS
'Points awarded to referrer when someone purchases this tier via referral. 0 for free tier.';

COMMENT ON COLUMN subscription_tiers.points_cost IS
'Points required to purchase this tier using referral points redemption. Typically 10x the points awarded.';
