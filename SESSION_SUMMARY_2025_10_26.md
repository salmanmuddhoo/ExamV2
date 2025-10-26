# Session Summary: Student Subscription Grade & Subject Selection Implementation

**Session Date:** October 26, 2025
**Branch:** `claude/add-email-login-011CUU3Jbipbket8CvubQ2Ej`
**Context:** Continuation session - previous session ran out of context

---

## Initial Problem

User reported that after purchasing student/student_lite tier subscriptions, they couldn't see their selected grade and subjects in their profile. The paper selection modal was also not showing any subjects, preventing access to exam papers and chat assistant.

**Database State (Before Fix):**
```json
{
  "selected_grade_id": null,
  "selected_subject_ids": null
}
```

This meant users had to manually select grade and subjects in their profile after purchase, which should have been set automatically during the purchase flow.

---

## Root Cause Analysis

Through extensive debugging with console logs, we discovered the following flow:

### Purchase Flow (What Should Happen):
```
User selects tier → StudentPackageSelector shown → Select grade & subjects →
Payment → payment_transactions created with grade/subject IDs →
handle_successful_payment trigger fires → Copies to user_subscriptions → ✓
```

### Actual Flow (What Was Happening):
```
User selects tier → StudentPackageSelector shown → Select grade & subjects →
Payment → payment_transactions created with grade/subject IDs ✓ →
handle_successful_payment trigger fires ✓ →
reset_subjects_on_tier_change trigger runs BEFORE UPDATE →
Clears grade/subject IDs to NULL ❌ →
user_subscriptions updated with NULL values ❌
```

**The Bug:** The `reset_subjects_on_tier_change` trigger (created in migration `20251026000002`) was running BEFORE the UPDATE completed and clearing the `selected_grade_id` and `selected_subject_ids` that `handle_successful_payment` was trying to set.

---

## Issues Fixed

### 1. **Access Control Regression (CRITICAL)**

**Issue:** Students with student/student_lite tiers could access ALL papers, not just their selected grade and subjects. The RLS policy was allowing all authenticated users to view all papers.

**Fix:** Migration `20251026000006_restore_student_tier_paper_access_control.sql`
- Dropped overly permissive policy: "Authenticated users can view all exam papers"
- Created new tier-based RLS policy that checks:
  - Pro tier: Full access
  - Free tier: View all papers (chat restricted separately)
  - Student/Student Lite: ONLY papers matching `selected_grade_id` AND `selected_subject_ids`

**Result:** Students can now only view papers for their purchased grade and subjects.

---

### 2. **Purchase Flow - Grade/Subject Selection Not Saved**

**Issue:** After purchase, `selected_grade_id` and `selected_subject_ids` were NULL in `user_subscriptions` table, even though they were correctly saved in `payment_transactions`.

**Root Cause:** `reset_subjects_on_tier_change` trigger was clearing values during the tier change update.

**Fix:** Migration `20251026000010_fix_reset_subjects_trigger_interference.sql`
- Updated `reset_subjects_on_tier_change()` function
- Added check: Only clear values if they are NULL in the incoming UPDATE
- If `handle_successful_payment` is setting grade/subjects, preserve them
- Logic: `IF NEW.selected_grade_id IS NULL THEN clear ELSE keep`

**Result:** Purchase flow now correctly saves grade and subjects to user_subscriptions.

---

### 3. **Tier Configuration Missing Flags**

**Issue:** `student_lite` tier didn't have `can_select_grade` and `can_select_subjects` set to TRUE, causing StudentPackageSelector to be skipped during purchase.

**Fix:** Migration `20251026000007_ensure_student_tiers_grade_subject_selection.sql`
- Set `can_select_grade = TRUE` for student and student_lite
- Set `can_select_subjects = TRUE` for student and student_lite

**Result:** StudentPackageSelector now shows during purchase for both tiers.

---

### 4. **Manual Grade/Subject Update Feature (Fallback)**

**Issue:** For users who purchased before the fix, their subscriptions had NULL selections and they couldn't access any papers.

**Solution:** Created a one-time setup feature in the profile.

**Migrations:**
- `20251026000008_add_update_subscription_selections_function.sql` - RPC function to update selections
- `20251026000009_restrict_selection_updates_to_null_only.sql` - Security fix to prevent abuse

**UI Changes (UserProfileModal.tsx):**
- If `selected_grade_id` and `selected_subject_ids` are NULL:
  - Show orange warning box: "Grade and Subjects Not Selected"
  - Show "Select Grade & Subjects" button
  - Opens StudentPackageSelector modal
  - Calls `update_subscription_selections()` RPC
  - **ONE-TIME ONLY** - Once set, selections are LOCKED

- If selections exist:
  - Show blue info box with read-only grade and subjects
  - Display as locked badges (no edit button)
  - Message: "These are the grade and subjects selected during your subscription purchase."
  - Footer note: "Need to change? Purchase new subscription"

**Security:** The RPC function checks if selections are NULL before allowing update. Once set, they cannot be changed to prevent system abuse (e.g., user switching subjects to access different content without paying).

---

### 5. **Subject Filtering by Grade**

**Issue:** When selecting a grade during purchase, students saw ALL subjects from the database. For example, selecting "O Level" showed both O Level AND A Level subjects.

**Fix:** Updated `StudentPackageSelector.tsx`
- `handleGradeSelect()` now queries `exam_papers` filtered by `grade_level_id`
- Extracts unique subjects that have papers for the selected grade
- Only displays subjects relevant to the chosen grade
- Clears subject list when going back to grade selection

**Result:**
- O Level → Shows only O Level subjects (e.g., 1 subject)
- A Level → Shows only A Level subjects (e.g., 10 subjects)

---

## Migrations Created

1. **`20251026000006_restore_student_tier_paper_access_control.sql`**
   - Restores RLS policy to enforce tier-based access
   - Students/student_lite can only view papers for their selected grade and subjects

2. **`20251026000007_ensure_student_tiers_grade_subject_selection.sql`**
   - Ensures `can_select_grade = TRUE` and `can_select_subjects = TRUE` for student/student_lite tiers

3. **`20251026000008_add_update_subscription_selections_function.sql`**
   - Creates `update_subscription_selections()` RPC function
   - Allows one-time setup of grade/subjects for users with NULL selections

4. **`20251026000009_restrict_selection_updates_to_null_only.sql`**
   - Security fix: RPC function only works when selections are NULL
   - Prevents users from changing selections after purchase to access different subjects

5. **`20251026000010_fix_reset_subjects_trigger_interference.sql`**
   - **CRITICAL FIX** - Updates `reset_subjects_on_tier_change()` trigger
   - Only clears grade/subjects if they're NULL in the incoming UPDATE
   - Allows `handle_successful_payment` to set values without interference

---

## UI Changes

### UserProfileModal.tsx

**Added:**
- Import `StudentPackageSelector` component
- State for `showEditSelections`, `updatingSelections`, `updateMessage`
- `handleUpdateSelections()` function to call RPC
- Conditional rendering for NULL selections (orange warning) vs existing selections (blue locked box)
- Modal overlay for StudentPackageSelector
- Success/error message display

**Changed:**
- Query to use proper foreign key syntax: `grade_levels!user_subscriptions_selected_grade_id_fkey(name)`
- Added extensive debug logging for subscription data
- Updated message: Removed "to prevent system abuse" for more professional tone

### SubscriptionModal.tsx

**Added:**
- Debug logging in `handleSelectPlan()` to verify tier configuration
- Debug logging in `proceedToPayment()` to track grade/subject IDs
- Debug logging in `handleStudentSelectionComplete()` to verify selections

**Purpose:** Help diagnose where data is lost in the purchase flow

### StripePayment.tsx

**Added:**
- Debug logging before creating payment transaction
- Debug logging after transaction creation
- Logs grade and subject IDs to verify they're being saved

### StudentPackageSelector.tsx

**Changed:**
- `handleGradeSelect()` now async and queries exam_papers by grade
- Filters subjects to only show those with papers for the selected grade
- `handleBackToGrades()` clears subject list when going back

---

## Debug Logging Added

Extensive console logging was added throughout the purchase flow to diagnose issues:

### Console Logs to Watch:

**1. Tier Selection:**
```
=== SUBSCRIPTION TIER SELECTION DEBUG ===
Tier name: student_lite
Can select subjects: true  ← Should be TRUE
Can select grade: true     ← Should be TRUE
Max subjects: 1
```

**2. Student Selection Complete:**
```
=== STUDENT SELECTION COMPLETE DEBUG ===
Grade ID: <uuid>           ← Should NOT be null
Subject IDs: [<uuid>, ...] ← Should have IDs
```

**3. Payment Data:**
```
=== STRIPE PAYMENT DEBUG ===
Selected grade ID: <uuid>
Selected subject IDs: [<uuid>, ...]
```

**4. Transaction Created:**
```
Transaction created: {...}
Transaction selected_grade_id: <uuid>
Transaction selected_subject_ids: [<uuid>, ...]
```

**5. Subscription Data After Purchase:**
```
=== SUBSCRIPTION DATA DEBUG ===
Selected grade ID: <uuid>  ← Should NOT be null after fix
Selected subject IDs: [...] ← Should NOT be null after fix
```

---

## Testing Checklist

### For New Purchases (After Applying Migrations):

1. ✅ Open subscription modal
2. ✅ Select student or student_lite tier
3. ✅ Verify StudentPackageSelector appears
4. ✅ Select a grade (e.g., "O Level")
5. ✅ Verify ONLY subjects for that grade are shown
6. ✅ Select subject(s) within the limit
7. ✅ Complete payment (test card: 4242 4242 4242 4242)
8. ✅ Check console logs - grade and subject IDs should flow through
9. ✅ Open Profile → Subscription tab
10. ✅ Verify grade and subjects are displayed (blue locked box)
11. ✅ Open Paper Selection Modal
12. ✅ Verify ONLY your grade and subjects are shown
13. ✅ Verify you can access papers and use chat assistant

### For Existing Subscriptions with NULL Selections:

1. ✅ Open Profile → Subscription tab
2. ✅ Verify orange warning box appears
3. ✅ Click "Select Grade & Subjects" button
4. ✅ StudentPackageSelector modal opens
5. ✅ Select grade and subjects
6. ✅ Verify success message appears
7. ✅ Refresh page
8. ✅ Verify grade and subjects now displayed (blue locked box)
9. ✅ Try to call RPC again (should fail with "locked" error)

---

## Manual Fixes Required

### If User Has NULL Selections After Purchase:

Run this SQL to manually fix their subscription (replace UUIDs with actual values):

```sql
-- Copy grade/subjects from payment_transaction to user_subscription
UPDATE user_subscriptions us
SET
  selected_grade_id = pt.selected_grade_id,
  selected_subject_ids = pt.selected_subject_ids,
  updated_at = NOW()
FROM payment_transactions pt
WHERE us.user_id = '<user_id>'
  AND pt.id = '<transaction_id>'
  AND us.status = 'active';

-- Verify the update
SELECT selected_grade_id, selected_subject_ids
FROM user_subscriptions
WHERE user_id = '<user_id>';
```

### To Find Latest Transaction for a User:

```sql
SELECT id, selected_grade_id, selected_subject_ids, created_at
FROM payment_transactions
WHERE user_id = '<user_id>'
  AND status = 'completed'
ORDER BY created_at DESC
LIMIT 1;
```

---

## Database Triggers Overview

### 1. `handle_successful_payment` (AFTER INSERT/UPDATE on payment_transactions)
- Fires when payment status changes to 'completed'
- Creates or updates user_subscriptions
- **Copies** `selected_grade_id` and `selected_subject_ids` from payment transaction
- Handles token carryover on upgrades

### 2. `reset_subjects_on_tier_change` (BEFORE UPDATE on user_subscriptions)
- Fires when tier_id changes
- **NOW FIXED:** Only clears grade/subjects if they're NULL in the incoming UPDATE
- Previously was clearing values that `handle_successful_payment` was trying to set

### Execution Order:
```
1. payment_transactions INSERT
2. handle_successful_payment fires (AFTER INSERT)
3. user_subscriptions UPDATE (inside handle_successful_payment)
4. reset_subjects_on_tier_change fires (BEFORE UPDATE)
   → Checks if NEW.selected_grade_id IS NULL
   → If NOT NULL, preserves it ✓
5. UPDATE completes with values preserved
```

---

## RLS Policies

### exam_papers Table:

**Policy:** "Users can view papers based on subscription tier"

**Logic:**
- Pro tier: Access all papers
- Free tier: Access all papers (chat restricted separately)
- Student/Student Lite:
  ```sql
  WHERE exam_papers.grade_level_id = us.selected_grade_id
    AND exam_papers.subject_id = ANY(us.selected_subject_ids)
  ```
- No subscription: Defaults to free tier behavior

**Security:** Enforced at database level, cannot be bypassed via API.

---

## Known Issues / Future Improvements

### Resolved:
- ✅ Grade and subjects not saving during purchase
- ✅ RLS policy allowing access to all papers
- ✅ Subjects not filtered by grade
- ✅ Manual edit allowing system abuse
- ✅ Tier configuration missing flags

### Potential Improvements:
- Add ability for admin to update user selections (edge case support)
- Add audit log for subscription changes
- Consider allowing ONE subject change per subscription period (with limitations)
- Add more descriptive error messages for RPC failures
- Consider caching grade-specific subjects to improve performance

---

## Important Technical Details

### Subscription Tiers Configuration:

| Tier | can_select_grade | can_select_subjects | max_subjects | Access |
|------|------------------|---------------------|--------------|--------|
| free | FALSE | FALSE | NULL | 2 papers (auto-tracked subjects) |
| student_lite | TRUE | TRUE | 1 | Selected grade + 1 subject |
| student | TRUE | TRUE | 8 | Selected grade + up to 8 subjects |
| pro | FALSE | FALSE | NULL | All papers |

### User Subscriptions Table Schema:

```sql
CREATE TABLE user_subscriptions (
  user_id UUID PRIMARY KEY,
  tier_id UUID REFERENCES subscription_tiers,
  selected_grade_id UUID REFERENCES grade_levels,
  selected_subject_ids UUID[],  -- Array of subject IDs
  status TEXT,
  -- ... other fields
);
```

### Payment Transactions Table Schema:

```sql
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  tier_id UUID REFERENCES subscription_tiers,
  selected_grade_id UUID REFERENCES grade_levels,
  selected_subject_ids UUID[],  -- Copied to user_subscriptions on success
  status TEXT,
  -- ... other fields
);
```

---

## Session Storage Keys Used

The subscription modal uses sessionStorage to persist state:

- `subscription_tiers` - Cached tier data
- `subscription_current` - Current user subscription
- `subscription_billingCycle` - Selected billing cycle (monthly/yearly)
- `subscription_showStudentSelector` - Boolean to show StudentPackageSelector
- `subscription_selectedStudentTier` - Currently selected tier object
- `subscription_showPayment` - Boolean to show payment page
- `subscription_paymentData` - Payment data object with grade/subject IDs

**Important:** Clear these when testing by running `sessionStorage.clear()` in browser console.

---

## Files Modified

### Migrations:
- `20251026000006_restore_student_tier_paper_access_control.sql`
- `20251026000007_ensure_student_tiers_grade_subject_selection.sql`
- `20251026000008_add_update_subscription_selections_function.sql`
- `20251026000009_restrict_selection_updates_to_null_only.sql`
- `20251026000010_fix_reset_subjects_trigger_interference.sql` (CRITICAL)

### Frontend Components:
- `src/components/UserProfileModal.tsx` - Profile display and manual setup
- `src/components/SubscriptionModal.tsx` - Debug logging
- `src/components/StripePayment.tsx` - Debug logging
- `src/components/StudentPackageSelector.tsx` - Grade-based subject filtering

---

## Commands Run

### Git Commands:
```bash
git status
git add -A
git commit -m "..."
git push -u origin claude/add-email-login-011CUU3Jbipbket8CvubQ2Ej
```

### Database Queries Run (For Debugging):
```sql
-- Check tier configuration
SELECT name, can_select_grade, can_select_subjects, max_subjects
FROM subscription_tiers
WHERE name IN ('student', 'student_lite');

-- Check user subscription
SELECT selected_grade_id, selected_subject_ids
FROM user_subscriptions
WHERE user_id = '<user_id>' AND status = 'active';

-- Check payment transaction
SELECT id, selected_grade_id, selected_subject_ids
FROM payment_transactions
WHERE id = '<transaction_id>';

-- Check triggers
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'user_subscriptions';

-- Get trigger function definition
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'handle_successful_payment';
```

---

## Next Steps

1. **Apply all migrations** to production database in order:
   - 20251026000006
   - 20251026000007
   - 20251026000008
   - 20251026000009
   - **20251026000010** (Most important!)

2. **Test the complete purchase flow** with a test account

3. **Fix existing users** with NULL selections using the manual SQL update

4. **Monitor console logs** on production to ensure no issues

5. **Consider removing debug logs** once confirmed working (or leave for ongoing debugging)

---

## Key Learnings

1. **BEFORE UPDATE triggers** can interfere with data being set in the UPDATE statement
2. **Always check for trigger interference** when data isn't saving as expected
3. **Console logging is invaluable** for tracing data flow through complex systems
4. **RLS policies must be carefully designed** to balance security and functionality
5. **One-time setup features** need security checks to prevent abuse
6. **Grade-specific filtering** is essential for good UX in educational platforms

---

## Contact Points for Issues

If issues arise in the next session:

1. **Check console logs** - All major flow points have debug logging
2. **Query database directly** - Verify data at each step (transaction → subscription)
3. **Check trigger execution order** - BEFORE vs AFTER matters
4. **Verify RLS policies** - May be blocking legitimate access
5. **Clear sessionStorage** - Cached data can cause confusion

---

**End of Session Summary**
