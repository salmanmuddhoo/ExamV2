-- Add onboarding tracking to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT NULL;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
ON profiles(onboarding_completed);

COMMENT ON COLUMN profiles.onboarding_completed IS 'Tracks onboarding status: NULL = not started, FALSE = in progress, TRUE = completed';
