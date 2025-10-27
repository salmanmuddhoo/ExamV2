-- =====================================================
-- IMMEDIATE FIX: Update trigger to save first_name and last_name
-- =====================================================
-- Run this SQL in your Supabase SQL Editor NOW

-- Update the handle_new_user function to extract first_name and last_name from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_first_name TEXT;
  user_last_name TEXT;
  user_role TEXT;
BEGIN
  -- Extract first_name, last_name, and role from user metadata
  -- These are set during signup in the auth.signUp() call
  user_first_name := COALESCE(new.raw_user_meta_data->>'first_name', '');
  user_last_name := COALESCE(new.raw_user_meta_data->>'last_name', '');
  user_role := COALESCE(new.raw_user_meta_data->>'role', 'student');

  -- Insert into profiles with elevated privileges
  INSERT INTO public.profiles (id, email, role, first_name, last_name, is_active)
  VALUES (new.id, new.email, user_role, user_first_name, user_last_name, true)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Could not create profile for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$;

-- Verify the function was updated
SELECT
    proname as function_name,
    prosecdef as is_security_definer,
    pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname = 'handle_new_user';

-- =====================================================
-- OPTIONAL: Fix existing profiles with NULL names
-- =====================================================
-- If you have existing users with NULL first_name/last_name,
-- you can try to update them from the auth.users metadata:

UPDATE profiles p
SET
    first_name = COALESCE(u.raw_user_meta_data->>'first_name', ''),
    last_name = COALESCE(u.raw_user_meta_data->>'last_name', '')
FROM auth.users u
WHERE p.id = u.id
  AND (p.first_name IS NULL OR p.last_name IS NULL)
  AND (u.raw_user_meta_data->>'first_name' IS NOT NULL OR u.raw_user_meta_data->>'last_name' IS NOT NULL);

-- Check how many profiles were updated
SELECT COUNT(*) as profiles_updated
FROM profiles
WHERE first_name IS NOT NULL OR last_name IS NOT NULL;
