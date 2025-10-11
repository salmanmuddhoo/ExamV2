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
- **Tokens and papers used carry forward** (prevents gaming the system)

**Token Carryover Logic:**
```
Student Package: Used 200K / 500K tokens
↓ Upgrades to Professional (Unlimited)
Professional Package: Starts with 200K tokens already used
✓ Cannot reset usage by upgrading
```

**Example:**
```
User on Student Package (5 days remaining, 200K tokens used)
↓ Upgrades to Professional
Professional Package activated immediately
New 30-day period starts
Token usage: 200K carried forward (now unlimited, but usage tracked)
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
- **Papers Limit**: 2 exam papers total
- **Grade/Subject Selection**: No restrictions (access all)
- **Price**: $0 (Free)
- **Duration**: 30-day periods

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
Used 250K / 500K tokens

User upgrades to Professional ($25/month)

Result:
- Student Package cancelled immediately
- Professional Package activated
- New 30-day period starts
- Token usage: 250K carried forward
- Professional has unlimited tokens, but usage still tracked
- Paid $25 for Professional
- Previous $15 already paid (not refunded)

Why carry forward?
Prevents users from gaming: "Use 499K tokens, upgrade to Pro,
reset to 0, downgrade back" - This is blocked!
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

**Last Updated**: October 2025
**Version**: 1.0.0
