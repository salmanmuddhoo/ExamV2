-- Add first_name and last_name columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text;

-- Create index for name searches (optional but helpful for future features)
CREATE INDEX IF NOT EXISTS idx_profiles_names ON profiles(first_name, last_name);
