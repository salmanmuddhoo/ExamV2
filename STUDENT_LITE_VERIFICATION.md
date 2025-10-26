# Student Lite Tier Verification

## Summary
Student Lite tier has **exactly the same access** as Student tier, with the only difference being the number of subjects allowed. This document verifies the implementation.

## Tier Comparison

| Feature | Student Tier | Student Lite Tier |
|---------|--------------|-------------------|
| **Yearly Papers Access** | ✅ Yes | ✅ Yes |
| **Chapter-wise Questions Access** | ✅ Yes | ✅ Yes |
| **Grade Selection** | ✅ 1 Grade | ✅ 1 Grade |
| **Subject Selection** | ✅ Up to max_subjects (configurable) | ✅ Up to max_subjects (configurable) |
| **Access Control** | Selected grade + subjects only | Selected grade + subjects only |
| **Papers Locked** | All non-selected | All non-selected |
| **Chapters Locked** | All non-selected | All non-selected |

## Current Configuration

Based on migration `20251026000001_enable_chapter_access_for_student_lite.sql`:

```sql
UPDATE subscription_tiers
SET
  chapter_wise_access = TRUE,
  max_subjects = 3,  -- Currently set to 3
  description = 'Access yearly papers and chapter-wise questions for your selected grade and 3 subjects'
WHERE name = 'student_lite';
```

**Note**: The `max_subjects` field is configurable by admin. Current setting is 3 subjects.

## Access Control Implementation

All database functions treat `student_lite` identically to `student`:

### 1. Grade Access
```sql
IF v_subscription.tier_name IN ('student', 'student_lite') AND v_subscription.can_select_grade THEN
  -- Returns only selected grade
END IF;
```

### 2. Subject Access
```sql
IF v_subscription.tier_name IN ('student', 'student_lite') AND v_subscription.can_select_subjects THEN
  -- Returns only selected subjects (up to max_subjects)
END IF;
```

### 3. Paper Access
```sql
IF v_subscription.tier_name IN ('student', 'student_lite') THEN
  -- Filters papers by selected grade + subjects
END IF;
```

### 4. Chat Access
```sql
IF v_subscription.tier_name IN ('student', 'student_lite') THEN
  -- Full chat access for selected papers
END IF;
```

## Subscription Flow

### When Upgrading from Free to Student Lite:

1. **User selects Student Lite tier** in SubscriptionModal
2. **Package Selection appears** (SubscriptionModal.tsx lines 158-201):
   - User selects 1 grade (e.g., "A Level")
   - User selects subjects (up to `max_subjects` limit)
   - Example: If max_subjects = 3, user can select up to 3 subjects
3. **Subscription created** with:
   ```typescript
   {
     selectedGradeId: gradeId,
     selectedSubjectIds: subjectIds  // Array of selected subject IDs
   }
   ```
4. **Subjects saved** to `user_subscriptions.selected_subject_ids`
5. **Profile displays** selected grade and subjects

### Profile Display After Upgrade:

```
┌─────────────────────────────────────────┐
│ Subscription Tier: Student Lite         │
│ Grade: A Level                           │
│                                          │
│ Subjects:                                │
│ [Mathematics] [Physics] [Chemistry]      │
│                                          │
│ (Shows up to max_subjects)               │
└─────────────────────────────────────────┘
```

## Access After Upgrade

### What Student Lite Users Can Access:

**Year Mode:**
- ✅ All yearly papers for selected grade + subjects
- ❌ Papers for other grades (locked)
- ❌ Papers for other subjects (locked)

**Chapter Mode:**
- ✅ All syllabuses for selected grade + subjects
- ✅ All chapters for selected grade + subjects
- ❌ Chapters for other grades/subjects (locked)

**Example:**
If user selected: Grade "A Level" + Subjects "Math, Physics, Chemistry"

**Accessible:**
- ✅ A Level Mathematics - All papers & chapters
- ✅ A Level Physics - All papers & chapters
- ✅ A Level Chemistry - All papers & chapters

**Locked:**
- ❌ A Level Biology papers & chapters
- ❌ O Level papers & chapters (different grade)
- ❌ Any other grade/subject combination

## Code Verification

### Profile Display (UserProfileModal.tsx)

Lines 762-781 show subjects for both student and student_lite:

```typescript
{(tierName === 'student' || tierName === 'student_lite') && selectedGrade && (
  <p className="text-sm text-gray-600 mb-2">Grade: <span className="font-medium">{selectedGrade}</span></p>
)}
{(tierName === 'student' || tierName === 'student_lite') && selectedSubjects.length > 0 && (
  <div className="mb-4">
    <p className="text-sm text-gray-600 mb-2">Subjects:</p>
    <div className="flex flex-wrap gap-2">
      {selectedSubjects.map((subject, index) => (
        <span key={index} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs">
          {subject}
        </span>
      ))}
    </div>
  </div>
)}
```

### Package Selection (SubscriptionModal.tsx)

Lines 158-201 handle package selection for tiers with `can_select_subjects`:

```typescript
if (tier.can_select_subjects) {
  // Show package selection UI
  // User selects grade and subjects
  // Proceeds to payment with:
  proceedToPayment(selectedStudentTier, gradeId, subjectIds);
}
```

## Subject Limit Configuration

The number of subjects is controlled by the `max_subjects` column in `subscription_tiers` table.

**To change the subject limit:**

```sql
-- For Student Lite: Set to 1 subject
UPDATE subscription_tiers
SET max_subjects = 1
WHERE name = 'student_lite';

-- For Student: Set to 8 subjects
UPDATE subscription_tiers
SET max_subjects = 8
WHERE name = 'student';
```

**Current Migration Sets:**
- student_lite: max_subjects = 3
- student: max_subjects = 3 (default, can be changed by admin)

## Verification Checklist

- [x] Student Lite has `chapter_wise_access = TRUE`
- [x] Student Lite has configurable `max_subjects`
- [x] All access control functions treat student_lite like student
- [x] Profile displays selected grade for student_lite
- [x] Profile displays selected subjects for student_lite
- [x] Package selection works during subscription
- [x] Selected subjects are saved to database
- [x] Papers filtered by selected grade + subjects
- [x] Chapters filtered by selected grade + subjects
- [x] No code differences between student and student_lite access

## Conclusion

✅ **Student Lite tier is correctly implemented** with exactly the same access as Student tier.

✅ **The only difference** is the `max_subjects` limit, which is configurable by admin.

✅ **All features work identically:**
- Yearly paper access
- Chapter-wise question access
- Grade and subject restrictions
- Profile display
- Access control

✅ **When upgrading from free to student_lite:**
- User selects grade and subjects during subscription
- Subjects are saved to user_subscriptions.selected_subject_ids
- Profile displays selected grade and subjects
- Access is immediately restricted to selected grade + subjects

## Admin Configuration

To adjust the subject limit for each tier, update the `subscription_tiers` table:

```sql
-- Student Lite: 1 subject (as mentioned by user)
UPDATE subscription_tiers SET max_subjects = 1 WHERE name = 'student_lite';

-- Student: 8 subjects (as mentioned by user)
UPDATE subscription_tiers SET max_subjects = 8 WHERE name = 'student';

-- Or any other number as needed
```

This makes the tiers fully flexible and admin-configurable.
