# Student Package Restrictions Implementation

## Overview
This implements grade and subject restrictions for student packages, ensuring users can only access exam papers for their selected grade and subjects.

## Database Changes

### New Migration: `20251012000002_add_student_package_restrictions.sql`

#### 1. `can_user_access_paper(p_user_id, p_paper_id)` Function
Checks if a user can access a specific exam paper based on their subscription:

**Access Rules:**
- **Pro Tier**: ✅ Access to ALL papers (all grades and subjects)
- **Free Tier**: ✅ Access to ALL papers, but limited by paper count (e.g., 2 papers max)
  - Can re-access previously accessed papers without counting toward limit
- **Student Tier**: ✅ Access ONLY to papers matching:
  - Selected grade level
  - AND one of the selected subjects (up to 3)
  - ❌ All other papers are LOCKED

#### 2. RLS Policy on `exam_papers` Table
Automatically enforces restrictions at the database level:
- Admins can see all papers
- Regular users can only SELECT papers they have access to via `can_user_access_paper()`
- Papers outside their subscription are invisible to them

#### 3. `get_accessible_papers_for_user(p_user_id)` Function
Helper function to get the list of accessible papers for a user (useful for UI filtering)

## How It Works

### For Student Package Users:

1. **During Subscription Purchase:**
   - User selects 1 grade level (e.g., "Grade 10")
   - User selects up to 3 subjects (e.g., "Mathematics", "Physics", "Chemistry")
   - This data is stored in `user_subscriptions` table:
     - `selected_grade_id`: UUID of the grade level
     - `selected_subject_ids`: Array of subject UUIDs

2. **When Browsing Papers:**
   - User sees ONLY papers matching their grade and subjects
   - Example: Grade 10 student with Math, Physics, Chemistry sees:
     - ✅ Grade 10 - Mathematics papers
     - ✅ Grade 10 - Physics papers
     - ✅ Grade 10 - Chemistry papers
     - ❌ Grade 10 - Biology papers (LOCKED)
     - ❌ Grade 9 - Mathematics papers (LOCKED)
     - ❌ Grade 11 - Mathematics papers (LOCKED)

3. **When Opening a Paper:**
   - The `can_user_access_paper()` function is called
   - If user tries to access a paper outside their selection, access is denied
   - This happens automatically via RLS policy

### For Pro Package Users:

- ✅ Unlimited access to ALL grades
- ✅ Unlimited access to ALL subjects
- ✅ No restrictions whatsoever

### For Free Tier Users:

- ✅ Can browse ALL papers (all grades and subjects)
- ❌ Limited to accessing only 2 unique papers per month
- ✅ Can re-access the same 2 papers unlimited times

## UI Updates Needed

### 1. PaperSelectionModal
**Current Behavior**: Shows all papers
**New Behavior**: Automatically filtered by RLS policy

**No code changes needed!** The RLS policy automatically filters the query results.

### 2. Locked Paper Indicator (OPTIONAL Enhancement)
You could add a visual indicator in the UI to show locked papers:

```typescript
// Example: In PaperSelectionModal or ExamPapersBrowser
const [lockedPapers, setLockedPapers] = useState<Set<string>>(new Set());

// Fetch all papers (for display)
const { data: allPapers } = await supabase
  .from('exam_papers')
  .select('*');

// With RLS disabled (admin view), fetch accessible papers
const { data: accessiblePapers } = await supabase
  .from('exam_papers')
  .select('*');

// Determine which papers are locked
const lockedSet = new Set(
  allPapers
    .filter(p => !accessiblePapers.find(ap => ap.id === p.id))
    .map(p => p.id)
);
setLockedPapers(lockedSet);

// In render:
{papers.map(paper => (
  <div>
    {paper.title}
    {lockedPapers.has(paper.id) && (
      <Lock className="w-4 h-4 text-gray-400" />
    )}
  </div>
))}
```

## Testing Checklist

### Student Package Tests
- [ ] Student with Grade 10 + Math can access Grade 10 Math papers
- [ ] Student with Grade 10 + Math CANNOT access Grade 10 Physics papers
- [ ] Student with Grade 10 + Math CANNOT access Grade 9 Math papers
- [ ] Student with Grade 10 + Math CANNOT access Grade 11 Math papers
- [ ] Student with multiple subjects can access papers for all selected subjects
- [ ] Student can access unlimited papers within their grade and subjects

### Pro Package Tests
- [ ] Pro user can access ALL grade levels
- [ ] Pro user can access ALL subjects
- [ ] Pro user has no restrictions

### Free Tier Tests
- [ ] Free user can browse all papers (all grades and subjects)
- [ ] Free user can access up to 2 unique papers
- [ ] Free user can re-access already accessed papers
- [ ] Free user gets blocked when trying to access 3rd unique paper

### Admin Tests
- [ ] Admin can see all papers regardless of subscription

## Migration Application

To apply this migration:

1. **Option A: Supabase Dashboard (Recommended)**
   ```sql
   -- Go to Supabase Dashboard → SQL Editor
   -- Copy and paste the entire migration file
   -- Click "Run"
   ```

2. **Option B: Supabase CLI**
   ```bash
   cd project
   npx supabase db push
   ```

## Security Benefits

1. **Database-Level Enforcement**: Restrictions are enforced at the database level via RLS, not just in the application
2. **No Frontend Bypasses**: Even if someone manipulates the frontend, they cannot access restricted papers
3. **Automatic Filtering**: Queries automatically return only accessible papers
4. **Admin Override**: Admins can still see and manage all papers

## Future Enhancements

1. **Package Upgrade Flow**:
   - When student upgrades to Pro, remove grade/subject restrictions
   - When student downgrades from Pro to Student, prompt for grade/subject selection

2. **Package Modification**:
   - Allow students to change their selected grade/subjects
   - Consider pro-rating or keeping the same billing cycle

3. **Access Logs**:
   - Track which papers users access
   - Analytics on popular subjects/grades

4. **Locked Paper UI**:
   - Show "locked" badge on inaccessible papers
   - "Upgrade to access" call-to-action
   - Preview of locked content (first page only)
