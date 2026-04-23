-- Add onboarding tracking to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
ON profiles(onboarding_completed);

COMMENT ON COLUMN profiles.onboarding_completed IS 'Tracks whether user has completed the interactive onboarding tutorial';
