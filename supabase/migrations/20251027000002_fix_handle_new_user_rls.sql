-- Fix handle_new_user trigger to properly bypass RLS during signup
-- This resolves the "new row violates row-level security policy" error
-- that occurs when users sign up but haven't verified their email yet

-- The issue: When a user signs up, they're not yet "authenticated" (no session)
-- until they verify their email. The trigger needs to bypass RLS to create
-- the profile regardless of authentication status.

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
  -- SECURITY DEFINER makes this run with the function owner's privileges
  -- This bypasses RLS policies
  INSERT INTO public.profiles (id, email, role, first_name, last_name, is_active)
  VALUES (new.id, new.email, user_role, user_first_name, user_last_name, true)
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the signup
    RAISE WARNING 'Could not create profile for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$;

-- Grant execute permissions to all relevant roles
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;

-- Ensure the trigger exists and is properly configured
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user IS 'Creates a profile for new auth users. Uses SECURITY DEFINER to bypass RLS for unverified users.';
