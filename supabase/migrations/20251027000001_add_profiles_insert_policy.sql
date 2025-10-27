-- Add INSERT policy for profiles table
-- This migration fixes the "new row violates row-level security policy" error during signup

-- The profiles table was missing an INSERT policy, which caused RLS violations when:
-- 1. The handle_new_user() trigger tries to insert a new profile
-- 2. The app code does an upsert during signup or OAuth login
-- 3. OAuth users create their profile via fetchProfile

-- Add INSERT policy to allow authenticated users to insert their own profile
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "Users can insert their own profile" ON profiles IS 'Allows authenticated users to create their own profile during signup or OAuth login';
