# Subscription Lifecycle Documentation

This document explains the complete subscription lifecycle including upgrades, downgrades, cancellations, and expirations.

---

## Subscription Rules

### 1. Upgrades ✅
**Allowed at any time during active subscription**

- Free → Student Package ✅
- Free → Professional Package ✅
- Student Package → Professional Package ✅

**How it works:**
- User can upgrade immediately
- Old subscription is replaced
- New subscription starts immediately
- Period resets to new billing cycle
- **Token USAGE preserved, but gets NEW TIER LIMIT** (additive tokens)

**Token Addition Logic:**
```
Student Package: 500K limit, used 3K → 497K remaining
↓ Upgrades to Professional (5M limit)
Professional Package: Used 3K, limit now 5M
✓ Effectively got 497K + 5M = 5,497K tokens available
```

**If Upgrading to Unlimited:**
```
Student Package: 500K limit, used 3K → 497K remaining
↓ Upgrades to Professional (Unlimited)
Professional Package: Used 3K, unlimited tokens
✓ Gets unlimited tokens (tracked usage stays at 3K)
```

**Example:**
```
User on Student Package (5 days remaining)
- Token limit: 500K
- Used: 3K
- Remaining: 497K

↓ Upgrades to Professional ($25/month)

Professional Package activated immediately:
- Token limit: 5M (or unlimited based on admin config)
- Used: 3K (preserved)
- Remaining: 4,997K (or unlimited)
- New 30-day period starts
```

---

### 2. Downgrades ❌
**NOT allowed during active paid subscription**

Users **cannot** directly downgrade from:
- Professional → Student ❌
- Professional → Free ❌
- Student → Free ❌

**Why?**
- User has already paid for the current period
- Downgrading would mean losing access they paid for
- Must wait until subscription expires or cancel it

**Alternative - Cancel Subscription:**
Instead of downgrading, users should:
1. Click "Cancel Subscription"
2. Keep full access until end of billing period
3. Automatically downgrade to Free tier when period ends

---

### 3. Cancellation Flow 🔄

**User-Initiated Cancellation:**

**Step 1: Request Cancellation**
- User clicks "Cancel Subscription" in their profile
- Confirmation dialog appears showing retention date
- User confirms cancellation

**Step 2: Marked for Cancellation**
```sql
cancel_at_period_end = TRUE
is_recurring = FALSE (stops auto-renewal)
cancellation_requested_at = NOW()
status = 'active' (still active!)
```

**Step 3: Retention Period**
- Yellow warning banner shows expiration date
- User keeps **full access** to all features
- Can still use tokens, access papers, chat with AI
- "Reactivate Subscription" button available

**Step 4: Automatic Downgrade**
- Daily cron job runs: `process_subscription_expirations()`
- At `period_end_date`, subscription status → 'cancelled'
- New Free tier subscription is created automatically
- User retains account but with Free tier limits

**Example Timeline:**
```
Day 1: User cancels Student Package ($15/month)
↓
Days 2-30: Full Student Package access continues
↓ (Yellow banner shows: "Ending on [date]")
↓
Day 30: Period ends
↓ Automatic process runs
↓
Day 31: User now on Free tier (2 papers, 50K tokens)
```

---

### 4. Reactivation ↩️

**Before Expiration:**
User can change their mind and reactivate!

**How:**
1. Click "Reactivate Subscription" button in yellow banner
2. Cancellation flag is removed
3. Auto-renewal restored (for Stripe/PayPal, not MCB Juice)
4. Subscription continues as normal

**What changes:**
```sql
cancel_at_period_end = FALSE
is_recurring = TRUE (if Stripe/PayPal)
cancellation_reason = NULL
```

**Result:**
- Yellow banner disappears
- Subscription continues beyond current period
- Will auto-renew at period_end_date (if recurring)

---

### 5. Expiration Types

#### A. Cancelled Subscriptions
- User manually cancelled
- `cancel_at_period_end = TRUE`
- Status changes from 'active' → 'cancelled' at `period_end_date`
- **Automatic Free tier downgrade**

#### B. Non-Recurring Subscriptions (MCB Juice)
- Manual payment method
- `is_recurring = FALSE`
- Expires at `period_end_date` if no new payment
- Status changes from 'active' → 'expired'
- **Automatic Free tier downgrade**

#### C. Failed Auto-Renewal (Future Feature)
- Stripe/PayPal payment fails
- Status changes to 'suspended' or 'expired'
- **Automatic Free tier downgrade**

---

### 6. Automatic Free Tier Downgrade

**When it happens:**
1. **Cancelled subscription** reaches `period_end_date`
2. **MCB Juice subscription** expires without renewal
3. **No active subscription** found for user

**What happens:**
```sql
-- Old subscription status changes
UPDATE user_subscriptions
SET status = 'cancelled' OR status = 'expired'
WHERE period_end_date <= NOW()

-- New Free tier subscription created
INSERT INTO user_subscriptions (
  user_id,
  tier_id = FREE_TIER_ID,
  status = 'active',
  billing_cycle = 'monthly',
  is_recurring = FALSE,
  period_end_date = NOW() + 30 days
)
```

**Free Tier Details:**
- **Token Limit**: 50,000 tokens per month
- **Papers Limit**: 2 most recently accessed exam papers (dynamic)
- **Grade/Subject Selection**: No restrictions (access all grades and subjects)
- **Previous Selections**: Reset when downgrading (no retained grade/subject selections)
- **Price**: $0 (Free)
- **Duration**: 30-day periods

**Recent Papers Access (Free Tier):**
- Free tier users can access their 2 most recently accessed papers
- When downgraded from paid tier, the 2 most recent papers become accessible
- Accessing a new paper replaces the oldest paper in the list
- Based on conversation timestamps (when paper was last opened)
- See detailed documentation in "Free Tier Paper Access" section below

---

### 7. Payment Method Impact

#### Stripe / PayPal (Auto-Renewing)
```
is_recurring = TRUE
```
- Subscription automatically renews at `period_end_date`
- Token/paper limits reset each period
- User is charged automatically
- Continues indefinitely until cancelled

#### MCB Juice (Manual Payment)
```
is_recurring = FALSE
```
- Subscription does NOT auto-renew
- User must submit new payment each month/year
- Expires at `period_end_date` if no renewal
- Automatically downgrades to Free tier

---

### 8. Database Status Values

**Subscription Status:**
- `active` - Currently active, user has access
- `cancelled` - User cancelled, period ended, now on Free tier
- `expired` - Non-recurring subscription ended, now on Free tier
- `suspended` - Payment failed or admin suspended (future feature)

**Important Fields:**
- `cancel_at_period_end` - TRUE if scheduled for cancellation
- `is_recurring` - TRUE if auto-renews (Stripe/PayPal)
- `period_end_date` - When current period ends
- `cancellation_requested_at` - When user clicked cancel

---

### 9. Cron Job Requirements

**Daily Job - Process Expirations:**
```sql
SELECT process_subscription_expirations();
```

**What it does:**
1. Finds subscriptions with `cancel_at_period_end = TRUE` and `period_end_date <= NOW()`
2. Changes status to 'cancelled'
3. Finds non-recurring subscriptions with `period_end_date <= NOW()`
4. Changes status to 'expired'
5. Creates Free tier subscriptions for affected users
6. Ensures no user is left without a subscription

**Recommended Schedule:** Run once per day at midnight

---

### 10. User Experience Summary

#### Current Subscription
- ✅ Can upgrade anytime → immediate access
- ❌ Cannot downgrade → must cancel and wait
- ✅ Can cancel anytime → access until period ends
- ✅ Can reactivate after cancelling → before period ends

#### After Cancellation
- ✅ Full access until `period_end_date`
- ✅ Clear warning banner with end date
- ✅ Can reactivate before expiration
- ✅ Automatic Free tier after expiration

#### Free Tier Users
- ✅ Can upgrade to any paid tier anytime
- ✅ Keep Free tier even after paid subscription ends
- ✅ No credit card required
- ✅ 2 papers + 50K tokens per month

---

## Display Order

Tiers are ordered by `display_order` field:
1. **Free** (display_order = 1)
2. **Student Package** (display_order = 2)
3. **Professional Package** (display_order = 3)

Higher `display_order` = Higher tier = Upgrade
Lower `display_order` = Lower tier = Downgrade (blocked)

---

## Examples

### Example 1: User Wants Cheaper Plan
```
User: "I want to switch from Pro to Student to save money"
System: ❌ Direct downgrade not allowed

Solution:
1. Cancel Professional Package
2. Keep access until period ends (e.g., 20 days remaining)
3. After 20 days → Free tier
4. Subscribe to Student Package
```

### Example 2: User Upgrades Mid-Period
```
Day 15 of Student Package monthly ($15)
Limit: 500K, Used: 250K, Remaining: 250K

User upgrades to Professional ($25/month)

Result:
- Student Package cancelled immediately
- Professional Package activated
- New 30-day period starts
- Token usage: 250K preserved
- Professional limit: 5M (or unlimited based on admin config)
- New remaining: 4,750K (or unlimited minus 250K used)
- Paid $25 for Professional
- Previous $15 already paid (not refunded)

Math:
Student: 250K used, 250K remaining
      ↓ Upgrade
Pro: 250K used, 5M limit
   = 250K + (5M - 250K) = 250K remaining from Student + 4.75M new
   = Effectively 4.75M additional tokens
```

### Example 3: User Cancels MCB Juice
```
Day 10 of MCB Juice Student Package
User clicks "Cancel Subscription"

Result:
- Access continues for 20 more days
- Yellow banner: "Ending on [date]"
- Can reactivate anytime in next 20 days
- Day 30: Automatically → Free tier
```

---

## Technical Implementation

### Frontend (SubscriptionManager.tsx)
```typescript
// Upgrades allowed
const canUpgrade = (tier) => {
  return tier.display_order > currentTier.display_order;
}

// Downgrades blocked
const canDowngrade = (tier) => {
  return false; // Always blocked
}
```

### Backend (SQL Functions)
```sql
-- Cancel at period end
cancel_subscription_at_period_end(user_id, reason)

-- Reactivate
reactivate_subscription(user_id)

-- Process expirations (daily cron)
process_subscription_expirations()
```

---

## Free Tier Paper Access (Recent Papers)

### Overview
Free tier users can access their **2 most recently accessed papers** at any time. This ensures users always have access to their current study materials, even after subscription downgrades.

### How It Works

**Access Tracking:**
- Paper access is tracked via the `conversations` table
- When a user opens a paper, a conversation is created/updated
- The `updated_at` timestamp determines which papers are "recent"

**Access Rules:**

1. **New Free Tier User** (accessed < 2 papers):
   - Can access ANY paper
   - No restrictions until 2 papers accessed

2. **Free Tier User** (accessed >= 2 papers):
   - Can access only the 2 most recently used papers
   - All other papers are locked
   - Accessing a new paper replaces the oldest in the list

### Downgrade Scenarios

**Scenario 1: User Downgrades After Using Multiple Papers**
```
User on Pro: Accessed Papers A, B, C, D, E
Most recent: Paper D (Oct 20), Paper E (Oct 22)

After downgrade to Free:
✓ Paper D - Accessible (recent)
✓ Paper E - Accessible (recent)
✗ Papers A, B, C - Locked (too old)
```

**Scenario 2: User Accesses New Paper After Downgrade**
```
Current accessible: Paper D (Oct 20), Paper E (Oct 22)
User accesses Paper F (Oct 25)

Result:
✓ Paper E (Oct 22) - Still accessible
✓ Paper F (Oct 25) - Now accessible
✗ Paper D (Oct 20) - Now locked (replaced)
```

### Grade/Subject Selection Reset

**Important:** When a user downgrades to free tier:
- `selected_grade_id` is reset to NULL
- `selected_subject_ids` is reset to NULL
- User profile should NOT show previous Student/Student Lite selections
- User can browse all grades and subjects (free tier has no restrictions)
- If user upgrades again, they must select grade/subjects again

**Why Reset?**
- Free tier has no grade/subject restrictions
- Prevents confusion (showing "Grade 10 - Math" when user can access all grades)
- Clean slate for future upgrades
- Avoids UI showing outdated selections

### Database Functions

**get_recent_accessed_papers(user_id, limit)**
```sql
-- Returns array of paper IDs for most recent papers
SELECT get_recent_accessed_papers('user-uuid', 2);
-- Returns: ['paper-e-uuid', 'paper-f-uuid']
```

**can_user_access_paper(user_id, paper_id)**
```sql
-- Checks if user can access specific paper
-- For free tier: Uses recent papers logic
SELECT can_user_access_paper('user-uuid', 'paper-uuid');
-- Returns: true/false
```

**get_user_paper_access_status(user_id)**
```sql
-- Returns all papers with access status
SELECT * FROM get_user_paper_access_status('user-uuid');
-- Returns: paper details + is_accessible + is_recently_accessed + last_accessed_at
```

### Implementation Files

- **Migration**: `supabase/migrations/20251025000001_free_tier_recent_papers_access.sql`
- **UI Examples**: `FREE_TIER_UI_EXAMPLE.tsx`
- **Grade/Subject Reset**: `supabase/migrations/20251025000002_reset_selections_on_free_tier_downgrade.sql`

### Testing Checklist

- [ ] New free tier user can access 2+ papers initially
- [ ] After accessing 2 papers with conversations, only those 2 are accessible
- [ ] Accessing 3rd paper replaces oldest in the list
- [ ] Upgrade to Pro → access all papers
- [ ] Downgrade to Free → only 2 most recent papers accessible
- [ ] Downgrade resets selected_grade_id and selected_subject_ids to NULL
- [ ] User profile doesn't show grade/subject selections after downgrade

---

**Last Updated**: October 25, 2025
**Version**: 2.0.0
