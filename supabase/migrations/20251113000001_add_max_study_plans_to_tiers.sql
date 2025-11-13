-- Add max_study_plans field to subscription_tiers table
-- This limits how many study plans a user can create based on their tier

ALTER TABLE subscription_tiers
ADD COLUMN IF NOT EXISTS max_study_plans INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN subscription_tiers.max_study_plans IS 'Maximum number of study plans a user can create with this tier. NULL means unlimited.';

-- Set default values for existing tiers (adjust these based on your business logic)
-- Free tier: 3 study plans
-- Basic tier: 5 study plans
-- Premium tiers: unlimited (NULL)

-- You can update these manually or run specific updates:
-- UPDATE subscription_tiers SET max_study_plans = 3 WHERE tier_name = 'Free';
-- UPDATE subscription_tiers SET max_study_plans = 5 WHERE tier_name = 'Basic';
-- UPDATE subscription_tiers SET max_study_plans = NULL WHERE tier_name IN ('Premium', 'Enterprise');
