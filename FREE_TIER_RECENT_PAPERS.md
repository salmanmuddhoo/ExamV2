# Free Tier Recent Papers Access Control

## Overview

This feature implements intelligent paper access control for free tier users, ensuring they always have access to their **2 most recently accessed papers**, even after upgrading and downgrading their subscription.

## The Problem

**Scenario:**
1. Free tier user accesses Paper A and Paper B
2. User upgrades to Student/Pro and accesses Papers C, D, E, F
3. User's subscription expires → downgraded back to Free tier
4. **Previous behavior**: User could still only access Papers A and B (outdated)
5. **Expected behavior**: User should access the 2 most recently used papers

## The Solution

### Dynamic Recent Papers Tracking

The system now tracks paper access through the `conversations` table:
- Every time a user opens a paper, a conversation is created/updated
- The `updated_at` timestamp tracks the most recent access time
- Free tier users can access their 2 most recently accessed papers based on these timestamps

### Access Logic

#### For Free Tier Users:

**Case 1: Less than 2 papers accessed**
```
User has accessed: 1 paper
Status: Can access ANY paper
Reason: Under the 2-paper limit
```

**Case 2: Exactly 2 papers accessed**
```
User has accessed: Paper A (Jan 1), Paper B (Feb 1)
Status: Can access Paper A and Paper B
Locked: All other papers
```

**Case 3: More than 2 papers accessed (after downgrade)**
```
User previously accessed: Paper A, B, C, D, E
Most recent: Paper D (Oct 20), Paper E (Oct 22)
Status: Can access Paper D and Paper E only
Locked: Papers A, B, C and all others
Reason: Only 2 most recent papers are accessible
```

**Case 4: User accesses a new paper after downgrade**
```
Before: Paper D (Oct 20), Paper E (Oct 22) ← accessible
User accesses Paper F (Oct 25)
After: Paper E (Oct 22), Paper F (Oct 25) ← accessible
Locked: Paper D is now locked
```

### Upgrade/Downgrade Scenarios

#### Scenario 1: Free → Paid → Free (No New Papers)

```
Timeline:
Day 1 (Free): Access Paper A, Paper B
Day 2 (Upgrade to Student): 30 days of access to all papers
Day 32 (Downgrade to Free): Still can access Paper A, Paper B
```

**Result**: User retains access to their original 2 papers if they didn't access others.

---

#### Scenario 2: Free → Paid → Free (With New Papers)

```
Timeline:
Day 1 (Free): Access Paper A (Math), Paper B (Physics)
Day 2 (Upgrade to Pro): Access Papers C, D, E, F, G
  - Most recent: Paper F (Day 25), Paper G (Day 30)
Day 32 (Downgrade to Free): Can now access Paper F and Paper G
  - Paper A and B are LOCKED
```

**Result**: User now has access to the 2 most recently used papers (F and G).

---

#### Scenario 3: Downgraded User Accesses New Papers

```
Timeline:
User is on Free tier
Currently accessible: Paper X (Oct 1), Paper Y (Oct 15)

Day 1: User accesses Paper Z (new paper)
Result:
  - Accessible: Paper Y (Oct 15), Paper Z (Day 1)
  - Locked: Paper X (no longer in top 2)

Day 2: User accesses Paper W (another new paper)
Result:
  - Accessible: Paper Z (Day 1), Paper W (Day 2)
  - Locked: Paper X, Paper Y (no longer in top 2)
```

**Result**: The 2 most recent papers are always accessible. Older papers get locked.

---

## Database Implementation

### New Functions

#### 1. `get_recent_accessed_papers(user_id, limit)`

Returns the paper IDs for the N most recently accessed papers.

```sql
-- Get 2 most recent papers
SELECT get_recent_accessed_papers('user-uuid', 2);

-- Returns: [paper_e_uuid, paper_f_uuid]
```

**How it works:**
- Queries `conversations` table
- Orders by `updated_at DESC`
- Returns array of `exam_paper_id`
- Uses DISTINCT to avoid duplicates

---

#### 2. `can_user_access_paper(user_id, paper_id)` [UPDATED]

Checks if a user can access a specific paper.

**Free Tier Logic:**
1. Count total unique papers accessed
2. If count < 2: Allow access to ANY paper
3. If count >= 2:
   - Get 2 most recent papers
   - Check if requested paper is in that list
   - If yes: Allow access
   - If no: Deny access

---

#### 3. `get_user_paper_access_status(user_id)` [NEW]

Returns all papers with their access status for the user.

**Returns:**
```
paper_id               | UUID
paper_title            | TEXT
grade_name             | TEXT
subject_name           | TEXT
year                   | INTEGER
month                  | TEXT
is_accessible          | BOOLEAN  (Can user access this?)
is_recently_accessed   | BOOLEAN  (Is this in top 2 recent?)
last_accessed_at       | TIMESTAMPTZ (When last accessed)
access_status          | TEXT ('accessible', 'locked', 'recently_accessed')
```

**Example Query:**
```sql
SELECT * FROM get_user_paper_access_status('user-uuid');
```

**Example Result:**
| paper_title | is_accessible | access_status | last_accessed_at |
|------------|---------------|---------------|------------------|
| Math 2024 May | TRUE | recently_accessed | 2024-10-20 |
| Physics 2024 May | TRUE | recently_accessed | 2024-10-15 |
| Chemistry 2024 May | FALSE | locked | 2024-10-01 |
| Biology 2024 May | FALSE | locked | NULL |

---

## UI Integration

### Display User's Accessible Papers

Use the `get_user_paper_access_status` function to show which papers are accessible:

```typescript
// In React component
const { data: paperStatus } = await supabase
  .rpc('get_user_paper_access_status', { p_user_id: user.id });

// Display papers
paperStatus.forEach(paper => {
  if (paper.is_accessible) {
    // Show as accessible
  } else if (paper.access_status === 'locked') {
    // Show with lock icon and "Upgrade to access" message
  }
});
```

### Show Recently Accessed Papers in Profile

```typescript
// Filter for recently accessed papers
const recentlyAccessed = paperStatus.filter(
  p => p.is_recently_accessed && p.last_accessed_at !== null
);

// Display in profile
<div className="recent-papers">
  <h3>Your Recent Papers (Free Tier: 2/2)</h3>
  {recentlyAccessed.map(paper => (
    <div key={paper.paper_id}>
      <span>{paper.paper_title}</span>
      <span>{paper.grade_name} - {paper.subject_name}</span>
      <span>Last accessed: {paper.last_accessed_at}</span>
    </div>
  ))}
</div>
```

### Lock Icon for Inaccessible Papers

```typescript
{paperStatus.map(paper => (
  <div className={paper.is_accessible ? 'accessible' : 'locked'}>
    <h4>{paper.paper_title}</h4>
    {!paper.is_accessible && (
      <>
        <Lock className="w-4 h-4" />
        <button onClick={handleUpgrade}>Upgrade to Access</button>
      </>
    )}
  </div>
))}
```

---

## Testing Checklist

### Test Case 1: New Free Tier User
- [ ] User accesses Paper A → Success
- [ ] User accesses Paper B → Success
- [ ] User tries to access Paper C → Success (under limit)
- [ ] Verify: All 3 papers are accessible

### Test Case 2: Free Tier User at Limit
- [ ] User has accessed Papers A and B
- [ ] User tries Paper C → Denied
- [ ] User can still re-access Paper A → Success
- [ ] User can still re-access Paper B → Success

### Test Case 3: Upgrade and Downgrade
- [ ] Free user accesses Papers A (Oct 1), B (Oct 5)
- [ ] User upgrades to Pro
- [ ] User accesses Papers C, D, E, F, G
- [ ] Most recent: F (Oct 20), G (Oct 25)
- [ ] User downgrades to Free
- [ ] User can access Paper F → Success
- [ ] User can access Paper G → Success
- [ ] User cannot access Paper A → Denied
- [ ] User cannot access Paper B → Denied

### Test Case 4: Access New Paper After Downgrade
- [ ] Free user has Papers X (Oct 1), Y (Oct 15) accessible
- [ ] User accesses Paper Z (Oct 20)
- [ ] Paper Z becomes accessible → Success
- [ ] Paper Y still accessible → Success
- [ ] Paper X becomes locked → Verified
- [ ] `get_user_paper_access_status` returns correct status

### Test Case 5: Pro Tier (Unlimited Access)
- [ ] Pro user can access all papers
- [ ] No paper limits apply
- [ ] All papers show as 'accessible'

---

## Migration Application

### Apply via Supabase Dashboard

1. Go to Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/20251025000001_free_tier_recent_papers_access.sql`
4. Paste into editor
5. Click **Run**

### Apply via Supabase CLI

```bash
cd project
npx supabase db push
```

---

## Benefits

### 1. **Fair Access After Downgrade**
Users who downgrade aren't stuck with outdated papers they accessed months ago. They get the most recent papers they were working with.

### 2. **Encourages Exploration**
Free tier users can try 2 papers to evaluate the platform before upgrading.

### 3. **Smooth Upgrade Flow**
When users upgrade and access many papers, then downgrade, they still have access to relevant recent content.

### 4. **Automatic Management**
No manual intervention needed. The system automatically tracks and updates accessible papers based on usage.

### 5. **Database-Level Security**
Access control is enforced at the database level via functions, preventing frontend bypasses.

---

## Important Notes

### Conversations = Access

The system uses the `conversations` table to track paper access:
- When a user opens a paper, a conversation is created
- Accessing the same paper multiple times updates the `updated_at` timestamp
- The `updated_at` field determines recency

### Period Resets Don't Affect Access

Unlike token limits that reset monthly, paper access is persistent:
- Free tier users always see their 2 most recent papers
- This persists across subscription period resets
- Only changes when user accesses different papers

### Admin Override

Admins can always access all papers regardless of tier.

---

## Example User Journey

**Sarah's Story:**

**Month 1 - Free Tier**
- Accesses Math Paper A (Sept 1)
- Accesses Physics Paper B (Sept 5)
- Tries Chemistry Paper C → Blocked
- Message: "Free tier: 2/2 papers used. Upgrade to access more."

**Month 2 - Upgrades to Pro**
- Accesses Chemistry C, Biology D, Math E, Physics F
- Most recent by end of month: Math E (Sept 25), Physics F (Sept 30)

**Month 3 - Forgets to Renew, Back to Free**
- System automatically makes Math E and Physics F accessible
- Papers A and B are now locked
- Sarah can still study her most recent papers!

**Month 3 - Week 2**
- Sarah accesses Chemistry C (Oct 10)
- Now accessible: Physics F (Sept 30), Chemistry C (Oct 10)
- Math E is now locked

**Result**: Sarah always has access to her 2 most recent papers, ensuring continuity in her studies even on free tier.

---

## Security Considerations

1. **Database-level enforcement**: Access control via PL/pgSQL functions
2. **RLS policies**: Conversations table already has RLS
3. **No frontend bypass**: Cannot manipulate API calls to access locked papers
4. **Audit trail**: `conversations` table provides complete access history

---

## Future Enhancements

1. **Configurable Limit**: Allow admins to change free tier limit (currently 2)
2. **Grace Period**: Give users 7 days after downgrade to choose which 2 papers to keep
3. **Paper Pinning**: Let free users "pin" 2 papers to always keep them accessible
4. **Access Analytics**: Track which papers are most accessed by free tier users

---

**Last Updated**: October 25, 2025
**Version**: 1.0.0
**Migration**: `20251025000001_free_tier_recent_papers_access.sql`
