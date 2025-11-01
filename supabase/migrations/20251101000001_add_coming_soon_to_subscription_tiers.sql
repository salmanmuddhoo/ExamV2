-- Add "Coming Soon" feature to subscription tiers
-- This allows admins to mark packages as "Coming Soon" which prevents users from purchasing them
-- while still displaying them in the pricing page

-- Add coming_soon column to subscription_tiers
ALTER TABLE subscription_tiers
ADD COLUMN IF NOT EXISTS coming_soon BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN subscription_tiers.coming_soon IS
  'When true, the package is displayed as "Coming Soon" and users cannot purchase it. Admins can still manage it.';

-- Create index for filtering available packages (not coming soon and active)
CREATE INDEX IF NOT EXISTS idx_subscription_tiers_available
ON subscription_tiers(is_active, coming_soon)
WHERE is_active = TRUE AND coming_soon = FALSE;

-- Update existing packages to be available by default (not coming soon)
UPDATE subscription_tiers
SET coming_soon = FALSE
WHERE coming_soon IS NULL;

-- Optional: Add a helper function to check if a tier is purchasable
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_tier_purchasable(UUID) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION is_tier_purchasable(UUID) IS
  'Returns true if a subscription tier can be purchased (is_active = true AND coming_soon = false)';
