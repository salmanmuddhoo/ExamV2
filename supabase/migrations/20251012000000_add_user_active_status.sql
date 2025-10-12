-- Add is_active column to profiles table for user management
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add index for faster queries on active users
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- Add comment for documentation
COMMENT ON COLUMN profiles.is_active IS 'Indicates whether the user account is active. Inactive users cannot access the application.';
