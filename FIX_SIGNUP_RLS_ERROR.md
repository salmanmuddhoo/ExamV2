# Fix: "new row violates row-level security policy for table profiles"

## Problem
When users try to sign up with a new email account, they encounter the error:
```
new row violates row-level security policy for table "profiles"
```

## Root Cause
The `profiles` table was missing an **INSERT policy**. The table has RLS (Row Level Security) enabled but only has policies for:
- SELECT (viewing profiles)
- UPDATE (updating profiles)

Without an INSERT policy, the following operations fail:
1. The `handle_new_user()` trigger trying to create a profile on signup
2. The app's `upsert` operation during signup to add first_name/last_name
3. OAuth users creating their profile via `fetchProfile()`

## Solution
Add an INSERT policy to the `profiles` table that allows authenticated users to insert their own profile.

## How to Apply the Fix

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the following SQL:

```sql
-- Add INSERT policy for profiles table
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
```

5. Click **Run** to execute the query
6. Verify the policy was created by going to **Authentication** → **Policies** → **profiles table**

### Option 2: Via Supabase CLI

If you have the Supabase CLI installed and linked to your project:

```bash
# The migration file has already been created
# Just push it to your Supabase project
supabase db push

# Or apply migrations specifically
supabase migration up
```

The migration file is located at:
```
supabase/migrations/20251027000001_add_profiles_insert_policy.sql
```

### Option 3: Direct SQL (for immediate fix)

If you need an immediate fix and don't want to wait for migrations, run this SQL directly in your Supabase SQL Editor:

```sql
-- Quick fix: Add INSERT policy
CREATE POLICY IF NOT EXISTS "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Verify the policy was created
SELECT * FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'INSERT';
```

## Verification

After applying the fix, test the signup flow:

1. Try signing up with a new email address
2. The error should be gone and the profile should be created successfully
3. Check the `profiles` table to verify the new user was created with first_name and last_name

## Technical Details

### Why This Fix Works

The INSERT policy allows authenticated users to insert a row into the `profiles` table only if:
- They are authenticated (logged in)
- The `id` of the row being inserted matches their own user ID (`auth.uid()`)

This ensures:
- ✅ Users can only create their own profile (security preserved)
- ✅ The trigger `handle_new_user()` can insert profiles (it uses SECURITY DEFINER)
- ✅ The app's upsert operation works during signup
- ✅ OAuth users can create their profile automatically

### Files Changed

- `supabase/migrations/20251027000001_add_profiles_insert_policy.sql` - New migration file

### Related Code

- `/home/user/ExamV2/src/contexts/AuthContext.tsx` - Signup and profile creation logic
- `/home/user/ExamV2/supabase/migrations/20251001192123_create_initial_schema.sql` - Original profiles table creation
- `/home/user/ExamV2/supabase/migrations/20251012000001_fix_profiles_rls_recursion.sql` - Previous RLS fixes

## What's Next

After applying this fix:
1. Test user signup with email/password
2. Test OAuth login (Google, Apple, GitHub, etc.)
3. Verify profiles are created with correct first_name, last_name
4. Check that free tier subscription is automatically assigned

## Need Help?

If you still encounter issues after applying this fix:
1. Check the Supabase logs for detailed error messages
2. Verify RLS is enabled on the profiles table
3. Ensure the `handle_new_user()` trigger exists and has SECURITY DEFINER
4. Check that the `auto_assign_free_tier()` trigger is working
