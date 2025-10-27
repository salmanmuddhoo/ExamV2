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
  full_name TEXT;
  name_parts TEXT[];
BEGIN
  -- Extract role from user metadata
  user_role := COALESCE(new.raw_user_meta_data->>'role', 'student');

  -- Try to get first_name and last_name directly (from email/password signup)
  user_first_name := new.raw_user_meta_data->>'first_name';
  user_last_name := new.raw_user_meta_data->>'last_name';

  -- If not found, try to extract from OAuth metadata
  IF user_first_name IS NULL OR user_last_name IS NULL THEN
    -- OAuth providers typically provide 'full_name' or 'name'
    full_name := COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    );

    IF full_name IS NOT NULL AND full_name != '' THEN
      -- Split the full name into first and last parts
      name_parts := string_to_array(trim(full_name), ' ');

      IF array_length(name_parts, 1) > 0 THEN
        -- First name is the first part
        user_first_name := COALESCE(user_first_name, name_parts[1]);

        -- Last name is everything after the first part
        IF array_length(name_parts, 1) > 1 THEN
          user_last_name := COALESCE(user_last_name, array_to_string(name_parts[2:array_length(name_parts, 1)], ' '));
        END IF;
      END IF;
    END IF;
  END IF;

  -- Set default empty strings if still null
  user_first_name := COALESCE(user_first_name, '');
  user_last_name := COALESCE(user_last_name, '');

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
