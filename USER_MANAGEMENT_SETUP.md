# User Management Setup Instructions

## Overview
A new User Management feature has been added to the admin dashboard, allowing administrators to:
- View all registered users
- See user statistics (total, active, inactive, admins)
- Search users by email or name
- Filter users by status (all, active, inactive)
- Activate/Deactivate user accounts
- View user subscription information
- Protect admin accounts from deactivation

## Database Migration Required

### Step 1: Apply the Database Migration

You need to run the migration file located at:
`supabase/migrations/20251012000000_add_user_active_status.sql`

**Option A: Through Supabase Dashboard (Recommended)**
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of the migration file
4. Click "Run" to execute the migration

**Option B: Using Supabase CLI**
```bash
cd project
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

### Migration Contents:
The migration adds:
- `is_active` column to the `profiles` table (default: true)
- Index on `is_active` for faster queries
- Updated RLS policies

## Features

### Admin Dashboard - User Management Tab

#### Stats Cards
- **Total Users**: Count of all registered users
- **Active Users**: Count of users who can access the platform
- **Inactive Users**: Count of deactivated users
- **Administrators**: Count of admin users

#### Search and Filter
- Search by email, first name, or last name
- Filter by status: All, Active, or Inactive

#### User Table
Displays:
- User information (name, email, avatar)
- Role (admin/student)
- Current subscription tier
- Account status (active/inactive)
- Join date
- Action buttons

#### Actions
- **Activate**: Restore access for inactive users
- **Deactivate**: Remove access for active users
- **Admin Protection**: Admin accounts cannot be deactivated

## Access Control

### How Inactive Users Are Handled

1. **Database Level**:
   - User profile has `is_active = false`
   - User can still authenticate (login)
   - RLS policies still allow them to read their own profile

2. **Application Level** (TODO - Implementation Needed):
   You need to add checks in your application to prevent inactive users from accessing protected features:

```typescript
// Example: In AuthContext or a useEffect in App.tsx
useEffect(() => {
  if (user && profile) {
    if (!profile.is_active && profile.role !== 'admin') {
      // Redirect to an "Account Inactive" page
      // Or show a modal explaining their account is inactive
      // And sign them out
      signOut();
    }
  }
}, [user, profile]);
```

3. **Recommended Implementation**:
   Create a new component `InactiveAccountModal.tsx` that:
   - Shows when a user tries to access the app with an inactive account
   - Displays a message explaining their account has been deactivated
   - Provides contact information for support
   - Signs them out automatically

## UI Components

### New Files Created
1. **`src/components/UserManagement.tsx`**
   - Main user management interface
   - Handles user listing, search, filter, and status toggling

2. **`supabase/migrations/20251012000000_add_user_active_status.sql`**
   - Database migration for adding user active status

### Modified Files
1. **`src/components/AdminDashboard.tsx`**
   - Added "User Management" tab
   - Imported UserManagement component

## Security Considerations

1. **Admin Protection**:
   - Admin accounts cannot be deactivated through the UI
   - This prevents accidental lockout

2. **RLS Policies**:
   - Only admins can update the `is_active` status
   - Users can read their own profile to check status

3. **Soft Delete**:
   - This is a "soft delete" approach - user data is preserved
   - Accounts can be reactivated at any time
   - No data loss occurs

## Future Enhancements

Consider adding:
- Bulk user operations (activate/deactivate multiple users)
- User deletion (hard delete with data removal)
- Account suspension with time limits
- Activity logs for user management actions
- Email notifications when accounts are deactivated
- Reason tracking for deactivation
- User export functionality
- Role management (promote/demote users)

## Testing Checklist

- [ ] Migration applied successfully
- [ ] User Management tab appears in Admin Dashboard
- [ ] Can view all users
- [ ] Can search users by email and name
- [ ] Can filter by active/inactive status
- [ ] Can deactivate a student account
- [ ] Can reactivate a deactivated account
- [ ] Admin accounts show "Admin protected" instead of action button
- [ ] Stats cards show correct counts
- [ ] Inactive users cannot access the application (after implementing application-level checks)

## Support

For issues or questions:
1. Check the browser console for errors
2. Verify the migration was applied correctly
3. Ensure you're logged in as an admin
4. Check RLS policies in Supabase dashboard
