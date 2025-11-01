-- ============================================================================
-- MANUAL MIGRATION: Add "Coming Soon" Feature to Subscription Tiers
-- ============================================================================
-- Run this script directly in your Supabase SQL Editor if the automatic
-- migration hasn't been applied yet.
--
-- This is the same as migration: 20251101000001_add_coming_soon_to_subscription_tiers.sql
-- ============================================================================

-- Step 1: Add coming_soon column to subscription_tiers
DO $$
BEGIN
    -- Check if column already exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'subscription_tiers'
        AND column_name = 'coming_soon'
    ) THEN
        ALTER TABLE subscription_tiers
        ADD COLUMN coming_soon BOOLEAN DEFAULT FALSE;

        RAISE NOTICE 'Column "coming_soon" added successfully';
    ELSE
        RAISE NOTICE 'Column "coming_soon" already exists';
    END IF;
END $$;

-- Step 2: Add comment for documentation
COMMENT ON COLUMN subscription_tiers.coming_soon IS
  'When true, the package is displayed as "Coming Soon" and users cannot purchase it. Admins can still manage it.';

-- Step 3: Create index for filtering available packages
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_available
ON subscription_tiers(is_active, coming_soon)
WHERE is_active = TRUE AND coming_soon = FALSE;

-- Step 4: Update existing packages to be available by default
UPDATE subscription_tiers
SET coming_soon = FALSE
WHERE coming_soon IS NULL;

-- Step 5: Create helper function to check if a tier is purchasable
CREATE OR REPLACE FUNCTION is_tier_purchasable(tier_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_tier RECORD;
BEGIN
  SELECT is_active, coming_soon INTO v_tier
  FROM subscription_tiers
  WHERE id = tier_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Tier is purchasable if it's active AND not coming soon
  RETURN v_tier.is_active AND NOT v_tier.coming_soon;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_tier_purchasable(UUID) TO authenticated, anon;

-- Step 7: Add comment to function
COMMENT ON FUNCTION is_tier_purchasable(UUID) IS
  'Returns true if a subscription tier can be purchased (is_active = true AND coming_soon = false)';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify column was added
SELECT
    'coming_soon column exists' as status,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'subscription_tiers'
AND column_name = 'coming_soon';

-- Verify function was created
SELECT
    'is_tier_purchasable function exists' as status,
    routine_name
FROM information_schema.routines
WHERE routine_name = 'is_tier_purchasable'
AND routine_schema = 'public';

-- View all subscription tiers with new column
SELECT
  display_name,
  is_active,
  coming_soon,
  is_tier_purchasable(id) as purchasable,
  price_monthly,
  price_yearly
FROM subscription_tiers
ORDER BY display_order;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ "Coming Soon" feature migration completed successfully!';
    RAISE NOTICE 'All existing packages are set to coming_soon = FALSE (available for purchase)';
    RAISE NOTICE 'You can now update your admin panel to toggle this field';
END $$;
