-- =====================================================
-- IMMEDIATE FIX: Extract names from OAuth providers
-- =====================================================
-- Run this SQL in your Supabase SQL Editor NOW

-- Update the handle_new_user function to extract names from OAuth metadata
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
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'handle_new_user';

-- =====================================================
-- OPTIONAL: Fix existing OAuth users with NULL names
-- =====================================================
-- Update existing profiles to extract names from OAuth metadata

UPDATE profiles p
SET
    first_name = CASE
        -- First try direct first_name from metadata
        WHEN u.raw_user_meta_data->>'first_name' IS NOT NULL
        THEN u.raw_user_meta_data->>'first_name'
        -- Then try to extract from full_name or name
        WHEN COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') IS NOT NULL
        THEN split_part(trim(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')), ' ', 1)
        ELSE p.first_name
    END,
    last_name = CASE
        -- First try direct last_name from metadata
        WHEN u.raw_user_meta_data->>'last_name' IS NOT NULL
        THEN u.raw_user_meta_data->>'last_name'
        -- Then try to extract from full_name or name (everything after first word)
        WHEN COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') IS NOT NULL
        AND array_length(string_to_array(trim(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')), ' '), 1) > 1
        THEN array_to_string(
            (string_to_array(trim(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')), ' '))[2:],
            ' '
        )
        ELSE p.last_name
    END
FROM auth.users u
WHERE p.id = u.id
  AND (p.first_name IS NULL OR p.first_name = '' OR p.last_name IS NULL OR p.last_name = '')
  AND (
    u.raw_user_meta_data->>'first_name' IS NOT NULL
    OR u.raw_user_meta_data->>'last_name' IS NOT NULL
    OR u.raw_user_meta_data->>'full_name' IS NOT NULL
    OR u.raw_user_meta_data->>'name' IS NOT NULL
  );

-- Check results
SELECT
    COUNT(*) as total_profiles,
    COUNT(CASE WHEN first_name IS NOT NULL AND first_name != '' THEN 1 END) as profiles_with_first_name,
    COUNT(CASE WHEN last_name IS NOT NULL AND last_name != '' THEN 1 END) as profiles_with_last_name
FROM profiles;
