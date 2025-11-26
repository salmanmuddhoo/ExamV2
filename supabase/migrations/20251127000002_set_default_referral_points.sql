-- Set default referral point values for existing subscription tiers
-- These values can be adjusted by admins later

-- Free tier: No points awarded (free tier), costs 0 points (can't be purchased with points)
UPDATE subscription_tiers
SET
  referral_points_awarded = 0,
  points_cost = 0
WHERE name = 'free';

-- Student tier: Award 100 points to referrer, costs 500 points to purchase
UPDATE subscription_tiers
SET
  referral_points_awarded = 100,
  points_cost = 500
WHERE name = 'student';

-- Student Lite tier: Award 50 points to referrer, costs 250 points to purchase
UPDATE subscription_tiers
SET
  referral_points_awarded = 50,
  points_cost = 250
WHERE name = 'student_lite';

-- Pro tier: Award 200 points to referrer, costs 1000 points to purchase
UPDATE subscription_tiers
SET
  referral_points_awarded = 200,
  points_cost = 1000
WHERE name = 'pro';

COMMENT ON TABLE subscription_tiers IS
'Subscription tiers with pricing, limits, and referral point configuration.
referral_points_awarded: Points given to referrer when someone buys this tier.
points_cost: Points needed to purchase this tier.';
