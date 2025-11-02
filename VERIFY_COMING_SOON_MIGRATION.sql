-- Verification queries for "Coming Soon" feature
-- Run these in your Supabase SQL Editor to verify the migration was applied

-- 1. Check if coming_soon column exists
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'subscription_tiers'
AND column_name = 'coming_soon';

-- Expected result: One row showing coming_soon column with type 'boolean' and default 'false'

-- 2. Check if is_tier_purchasable function exists
SELECT routine_name, routine_type, data_type
FROM information_schema.routines
WHERE routine_name = 'is_tier_purchasable'
AND routine_schema = 'public';

-- Expected result: One row showing the function

-- 3. View all subscription tiers with coming_soon status
SELECT
  id,
  name,
  display_name,
  is_active,
  coming_soon,
  price_monthly,
  price_yearly,
  display_order
FROM subscription_tiers
ORDER BY display_order;

-- Expected result: All tiers with coming_soon = FALSE (by default)

-- 4. Test the is_tier_purchasable function with a tier ID
-- Replace 'YOUR_TIER_ID_HERE' with an actual tier ID from the query above
SELECT is_tier_purchasable('YOUR_TIER_ID_HERE'::uuid);

-- Expected result: TRUE (if tier is active and not coming soon)

-- 5. Test marking a tier as "Coming Soon" and check purchasability
-- IMPORTANT: Only run this if you want to test the feature
-- Replace 'YOUR_TIER_ID_HERE' with an actual tier ID

-- Update a tier to coming_soon (EXAMPLE - DO NOT RUN IN PRODUCTION WITHOUT INTENTION)
-- UPDATE subscription_tiers
-- SET coming_soon = TRUE
-- WHERE id = 'YOUR_TIER_ID_HERE'::uuid;

-- Check if it's now not purchasable
-- SELECT is_tier_purchasable('YOUR_TIER_ID_HERE'::uuid);
-- Expected result: FALSE

-- Revert the change
-- UPDATE subscription_tiers
-- SET coming_soon = FALSE
-- WHERE id = 'YOUR_TIER_ID_HERE'::uuid;

-- 6. Check the index was created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'subscription_tiers'
AND indexname = 'idx_subscription_tiers_available';

-- Expected result: One row showing the index definition

-- 7. Verify all existing tiers are still purchasable
SELECT
  display_name,
  is_active,
  coming_soon,
  is_tier_purchasable(id) as purchasable
FROM subscription_tiers
ORDER BY display_order;

-- Expected result: All active tiers should show purchasable = TRUE
