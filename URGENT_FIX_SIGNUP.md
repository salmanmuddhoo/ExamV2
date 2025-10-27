# 🚨 URGENT: Fix Signup RLS Error NOW

## Error You're Seeing
```
new row violates row-level security policy for table "profiles"
```

## Quick Fix (Takes 2 Minutes)

### Step 1: Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **"SQL Editor"** in the left sidebar
4. Click **"New query"** button

### Step 2: Run This SQL
Copy and paste this **ENTIRE** code block into the SQL editor:

```sql
-- ============================================
-- FIX FOR SIGNUP RLS ERROR
-- ============================================

-- Check what policies currently exist
SELECT
    policyname,
    cmd as operation,
    roles
FROM pg_policies
WHERE tablename = 'profiles';

-- Add INSERT policy for authenticated users
-- This allows users to create their own profile during signup
CREATE POLICY IF NOT EXISTS "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Add INSERT policy for service role
-- This allows database triggers to insert profiles
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Service role can insert profiles"
  ON profiles FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Verify the INSERT policies were created
SELECT
    policyname,
    cmd as operation,
    roles
FROM pg_policies
WHERE tablename = 'profiles' AND cmd = 'INSERT';
```

### Step 3: Execute the Query
1. Click the **"Run"** button (or press `Ctrl+Enter` / `Cmd+Enter`)
2. Wait for the query to complete
3. Check the output at the bottom - you should see 2 INSERT policies listed

### Step 4: Test Signup
1. Go to your app
2. Try signing up with a new email address
3. ✅ It should work now!

## What This Does

This adds two critical policies that were missing:

1. **"Users can insert their own profile"**
   - Allows authenticated users to create their profile during signup
   - Security: Users can only insert rows where the ID matches their own user ID

2. **"Service role can insert profiles"**
   - Allows database triggers (like `handle_new_user()`) to create profiles
   - Needed because triggers run with service role permissions

## Verification

After running the SQL, you should see output like this:

```
policyname                          | operation | roles
------------------------------------|-----------|------------------
Users can insert their own profile  | INSERT    | {authenticated}
Service role can insert profiles    | INSERT    | {service_role}
```

## Still Having Issues?

If you still get the error after applying this fix:

1. **Check if RLS is enabled:**
   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE tablename = 'profiles';
   ```
   Should show `rowsecurity = true`

2. **Check if the trigger exists:**
   ```sql
   SELECT tgname, tgtype, proname
   FROM pg_trigger t
   JOIN pg_proc p ON t.tgfoid = p.oid
   WHERE tgname = 'on_auth_user_created';
   ```
   Should return one row showing the trigger

3. **Check for errors in Supabase logs:**
   - Go to Supabase Dashboard → Logs
   - Look for detailed error messages

4. **Try re-running the SQL** - sometimes it needs a second execution

## What Caused This?

The `profiles` table had Row Level Security (RLS) enabled but was missing INSERT policies. It had:
- ✅ SELECT policies (for reading profiles)
- ✅ UPDATE policies (for updating profiles)
- ❌ INSERT policies (for creating profiles) **← This was missing!**

Without INSERT policies, neither users nor database triggers could create new profile records, causing signup to fail.

## Need More Help?

If this doesn't work, please share:
1. The output from running the SQL above
2. Any error messages from Supabase logs
3. Screenshot of the policies shown in Supabase Dashboard → Authentication → Policies
