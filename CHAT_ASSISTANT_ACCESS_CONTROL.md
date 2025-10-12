# Chat Assistant Access Control Implementation

## Overview
This implements proper access control for the chat assistant feature. **All users can VIEW and BROWSE any exam paper**, but only users with appropriate subscriptions can use the **CHAT ASSISTANT** with specific papers.

## Key Principle
🔑 **Paper Viewing = Unrestricted**
🔒 **Chat Assistant Usage = Restricted by Subscription**

## Database Changes

### Migration: `20251012000003_fix_chat_assistant_access_control.sql`

This migration **corrects** the previous approach that incorrectly restricted paper viewing.

#### 1. RLS Policy Changes
**Restored unrestricted paper viewing:**
```sql
-- All authenticated users can view ALL exam papers
CREATE POLICY "Authenticated users can view all exam papers"
  ON exam_papers FOR SELECT TO authenticated USING (true);

-- Anonymous users can also view all papers (for browsing before signup)
CREATE POLICY "Anonymous users can view all exam papers"
  ON exam_papers FOR SELECT TO anon USING (true);
```

#### 2. `can_user_use_chat_for_paper(p_user_id, p_paper_id)` Function
Checks if a user can use the **chat assistant** with a specific exam paper.

**Access Rules:**
- **Pro Tier**: ✅ Unlimited chat access to ALL papers (all grades and subjects)
- **Free Tier**: ✅ Can chat with ANY paper, but limited by token count
  - Once tokens run out, chat is blocked for all papers
- **Student Tier**: ✅ Can chat ONLY with papers matching:
  - Selected grade level
  - AND one of the selected subjects (up to 3)
  - AND has tokens remaining
  - ❌ Chat is blocked for papers outside their selections

#### 3. `get_chat_accessible_papers_for_user(p_user_id)` Function
Helper function to get the list of papers and their chat accessibility status.

Returns for each paper:
- `paper_id`: UUID
- `paper_title`: Text
- `grade_name`: Text
- `subject_name`: Text
- `can_chat`: Boolean (TRUE if user can use chat assistant with this paper)

## How It Works

### For All Users (Viewing):
1. **Browse Papers**: All users can browse the exam papers library
2. **View Papers**: All users can open and view any PDF exam paper
3. **Read Content**: All users can read exam paper content without restrictions

### For Chat Assistant Access:

#### Pro Package Users:
- ✅ Can use chat assistant with **ANY** paper
- ✅ Unlimited tokens
- ✅ No restrictions whatsoever

#### Free Tier Users:
- ✅ Can use chat assistant with **ANY** paper (all grades and subjects)
- ❌ Limited by token count (e.g., 100 tokens per month)
- ✅ Once tokens run out, must upgrade to continue using chat
- 📊 Tokens reset each billing cycle

#### Student Package Users:
- ✅ Can use chat assistant **ONLY** with papers matching:
  - Their selected grade level (e.g., Grade 10)
  - Their selected subjects (up to 3, e.g., Math, Physics, Chemistry)
- ❌ Chat is **LOCKED** for:
  - Papers from other grades
  - Papers from subjects not in their selection
- ✅ Unlimited chat within their selections (subject to token limits if any)

**Example:**
- Student with Grade 10 + Math, Physics, Chemistry subscription:
  - ✅ Can chat with: Grade 10 Math papers
  - ✅ Can chat with: Grade 10 Physics papers
  - ✅ Can chat with: Grade 10 Chemistry papers
  - ❌ **Cannot chat** with: Grade 10 Biology papers (subject not selected)
  - ❌ **Cannot chat** with: Grade 9 Math papers (wrong grade)
  - ❌ **Cannot chat** with: Grade 11 Math papers (wrong grade)

## Frontend Implementation

### ChatHub Component
**File:** `src/components/ChatHub.tsx`

**Changes Made:**
1. **Removed premature access check** - Paper selection now allows all users to view any paper
2. Users can browse and select any paper without restriction
3. Access checking is deferred to ExamViewer when chat is actually used

**User Flow:**
1. User clicks "New Conversation"
2. User selects a paper from the modal
3. Paper opens and user can **view the PDF freely**
4. Chat access is checked when user tries to send a message

### ExamViewer Component
**File:** `src/components/ExamViewer.tsx`

**Changes Made:**

#### 1. On Paper Load (Visual Indicator)
When exam paper loads, checks if chat is available:
- Calls `can_user_use_chat_for_paper` for student tier users
- Sets `chatLocked` state if paper is not in user's package
- Shows lock icon and upgrade message on chat input
- User can still view and scroll through PDF

#### 2. On Message Send (Access Enforcement)
When user tries to send a chat message:
- First checks `can_user_use_chat_for_paper` RPC function
- If access denied:
  - Displays restriction message in chat
  - Shows upgrade modal after 2 seconds
  - Prevents message from being sent
- If access granted:
  - Continues with token/paper limit checks
  - Processes the message normally

#### 3. Locked Chat UI
When chat is locked (`chatLocked = true`):
- Shows yellow warning box with lock icon
- Different messages for different lock reasons:
  - **Student tier**: "Not in Your Package" - explains grade/subject restriction
  - **Free tier**: "Limit Reached" - explains token/paper limit
- "View Upgrade Options" button opens subscription modal
- PDF remains fully viewable

**User Flow:**
1. User selects paper → Paper opens with PDF viewer
2. User can **view PDF freely** regardless of subscription
3. User tries to chat:
   - **Access check happens here**
   - If blocked: Lock icon appears with upgrade message
   - If allowed: Chat works normally

## Testing Checklist

### Student Package Tests
- [ ] Student with Grade 10 + Math can use chat with Grade 10 Math papers
- [ ] Student with Grade 10 + Math **CANNOT** use chat with Grade 10 Physics papers
- [ ] Student with Grade 10 + Math **CANNOT** use chat with Grade 9 Math papers
- [ ] Student with Grade 10 + Math **CANNOT** use chat with Grade 11 Math papers
- [ ] Student with multiple subjects can use chat with all selected subjects
- [ ] Student **CAN VIEW** all papers but chat is restricted
- [ ] Upgrade modal shows correct paper title when access denied

### Pro Package Tests
- [ ] Pro user can use chat with ALL grade levels
- [ ] Pro user can use chat with ALL subjects
- [ ] Pro user has no chat restrictions

### Free Tier Tests
- [ ] Free user can use chat with ANY paper (all grades and subjects)
- [ ] Free user gets blocked when tokens run out
- [ ] Free user can still VIEW papers when tokens run out
- [ ] Upgrade modal appears when attempting to chat with no tokens

### Viewing Tests (All Tiers)
- [ ] All users can browse exam papers library
- [ ] All users can view any exam paper PDF
- [ ] All users can read exam paper content
- [ ] Paper selection modal shows all papers (no filtering)

### Admin Tests
- [ ] Admin can use chat with all papers
- [ ] Admin can view all papers

## Migration Application

To apply this migration:

### Option A: Supabase Dashboard (Recommended)
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the entire migration file `20251012000003_fix_chat_assistant_access_control.sql`
3. Click "Run"

### Option B: Supabase CLI
```bash
cd project
npx supabase db push
```

## Important Notes

### ⚠️ Previous Migration Conflict
If you previously applied `20251012000002_add_student_package_restrictions.sql`, this new migration will:
- Drop the old restrictive RLS policies
- Create new permissive RLS policies for viewing
- Rename/replace access checking functions

### 🔄 Access Control Shift
**OLD (WRONG) Approach:**
- Restricted paper **VIEWING** based on subscription
- Users couldn't see papers outside their package

**NEW (CORRECT) Approach:**
- All users can **VIEW** any paper
- Only **CHAT ASSISTANT** usage is restricted
- Better user experience - browse freely, pay to interact

## Security Benefits

1. **Database-Level Enforcement**: Chat restrictions enforced at database via RPC function
2. **No Frontend Bypasses**: Even if someone manipulates frontend, they can't bypass database checks
3. **Fail-Safe**: If access check fails, system allows access to avoid blocking legitimate users
4. **Clear User Feedback**: Upgrade modal explains exactly why access is restricted

## Future Enhancements

1. **Paper Preview with Locked Chat**:
   - Show lock icon on chat input for restricted papers
   - Allow viewing paper while showing "Upgrade to chat" banner
   - Preview first few chat interactions before requiring upgrade

2. **Smart Recommendations**:
   - Suggest relevant papers user CAN chat with
   - "Similar papers in your package" suggestions

3. **Usage Analytics**:
   - Track which papers users attempt to chat with
   - Identify popular papers outside user packages
   - Personalized upgrade recommendations

4. **Progressive Access**:
   - Allow limited chat interactions (e.g., 3 messages) before requiring upgrade
   - Free preview of chat quality to encourage upgrades
