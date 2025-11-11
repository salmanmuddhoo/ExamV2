# Database Migrations

## Important: Applying Migrations to Supabase

After pulling code changes that include new database migrations, you **must** apply them to your Supabase database.

### How to Apply Migrations

#### Option 1: Using Supabase CLI (Recommended)
```bash
# Make sure you're logged in
supabase login

# Link your project (if not already linked)
supabase link --project-ref your-project-ref

# Apply all pending migrations
supabase db push
```

#### Option 2: Manual Application via Supabase Dashboard
1. Go to https://app.supabase.com
2. Select your project
3. Navigate to SQL Editor
4. Copy and paste the contents of each migration file in `supabase/migrations/` in order
5. Execute each one

### Recent Important Migrations

- **20251025000005_fix_paper_access_month_type.sql** - Creates `get_user_paper_access_status` function with proper permissions
- **20251109000002_add_study_plan_completion_and_badges.sql** - Adds study plan completion tracking
- **20251109000003_add_mcb_juice_phone_number_setting.sql** - Adds MCB Juice phone number configuration
- **20251109000004_grant_permissions_to_rpc_functions.sql** - Grants execute permissions to RPC functions

### Common Errors

**404 Error on RPC Functions**
- **Cause**: Migrations not applied or function doesn't exist
- **Solution**: Apply migrations using one of the methods above

**400 Error on Auth**
- **Cause**: User trying to access resources before email verification
- **Solution**: This is expected behavior. Users must verify email before full access.

**Function Does Not Exist Error During Migration**
- **Error**: `ERROR: function get_user_paper_access_status(uuid) does not exist`
- **Cause**: Migration files were reordered or database was reset
- **Solution**:
  1. Run the manual fix script: Copy contents of `supabase/migrations/MANUAL_FIX_check_and_create_function.sql`
  2. Paste into Supabase SQL Editor
  3. Execute the script
  4. Then retry `supabase db push`

**Migration Already Applied But Changes Not Reflected**
- **Cause**: Migration file was modified after being applied to remote database
- **Solution**: Migrations are tracked by filename. If you modify a migration file that was already applied, you need to either:
  1. Create a new migration file with the changes
  2. Remove the migration from tracking table:
     ```sql
     DELETE FROM supabase_migrations.schema_migrations WHERE version = '20251025000005';
     ```
  3. Then re-run `supabase db push`

### Verifying Migrations

To check if migrations were applied:
```sql
-- In Supabase SQL Editor
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;
```

You should see all migration versions listed there.
