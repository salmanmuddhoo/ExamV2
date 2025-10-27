# Quick Test: Yearly Subscription Expiration

This is a simplified guide to quickly test yearly subscription expiration.

## Prerequisites

- You need a test user with an active yearly subscription
- Access to Supabase SQL Editor
- Don't use a real production user!

---

## Step-by-Step Testing Guide

### Step 1: Find a Test User

```sql
-- Find users with yearly subscriptions
SELECT
  p.email,
  st.display_name as tier,
  us.subscription_end_date,
  us.status
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.status = 'active'
ORDER BY us.created_at DESC
LIMIT 5;
```

**📝 Copy the email of your test user**

---

### Step 2: Simulate Expired Subscription

Replace `'test@example.com'` with your test user's email:

```sql
-- Set subscription to expired (1 day ago)
UPDATE user_subscriptions
SET subscription_end_date = NOW() - INTERVAL '1 day'
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test@example.com')
AND status = 'active'
AND billing_cycle = 'yearly';
```

---

### Step 3: Verify Expiration Date

```sql
-- Check if subscription is now marked as expired
SELECT
  p.email,
  us.subscription_end_date,
  NOW() as current_time,
  CASE
    WHEN us.subscription_end_date < NOW() THEN '✅ EXPIRED'
    ELSE '❌ NOT EXPIRED'
  END as status
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
WHERE p.email = 'test@example.com'
AND billing_cycle = 'yearly';
```

**Expected:** Should show `✅ EXPIRED`

---

### Step 4: Run Expiration Function

```sql
-- Manually trigger the expiration function (normally runs daily via cron)
SELECT expire_yearly_subscriptions();
```

**Expected Output:** `Expired 1 yearly subscriptions` (or more if you have multiple expired)

---

### Step 5: Verify User Was Downgraded

```sql
-- Check user's current subscription
SELECT
  p.email,
  st.display_name as tier,
  st.token_limit,
  st.papers_limit,
  us.status,
  us.billing_cycle
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE p.email = 'test@example.com'
AND us.status = 'active';
```

**Expected Results:**
- ✅ `tier`: "Free"
- ✅ `token_limit`: 50000
- ✅ `papers_limit`: 2
- ✅ `status`: "active"
- ✅ `billing_cycle`: "monthly"

---

### Step 6: Check Old Subscription

```sql
-- View the expired subscription record
SELECT
  p.email,
  st.display_name as old_tier,
  us.status,
  us.subscription_end_date,
  us.updated_at
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE p.email = 'test@example.com'
AND us.status = 'expired'
ORDER BY us.updated_at DESC
LIMIT 1;
```

**Expected Results:**
- ✅ `old_tier`: "Student Package" (or whatever tier they had)
- ✅ `status`: "expired"

---

## Test in Application

1. **Log in as the test user**
2. **Open User Profile** (click on profile icon)
3. **Go to Subscription tab**
4. **Verify:**
   - Shows "Free" tier
   - Shows token limit: 50,000
   - Shows papers limit: 2
   - No yearly plan end date displayed

---

## Restore Subscription (Optional)

If you want to restore the test user back to their yearly subscription:

```sql
-- Delete the free tier subscription
DELETE FROM user_subscriptions
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test@example.com')
AND status = 'active'
AND tier_id = (SELECT id FROM subscription_tiers WHERE name = 'free');

-- Restore the yearly subscription
UPDATE user_subscriptions
SET
  status = 'active',
  subscription_end_date = NOW() + INTERVAL '1 year',
  period_end_date = NOW() + INTERVAL '1 month',
  period_start_date = NOW(),
  tokens_used_current_period = 0,
  updated_at = NOW()
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test@example.com')
AND status = 'expired'
AND billing_cycle = 'yearly';
```

---

## Quick Test Summary

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find test user | Email address copied |
| 2 | Set expiration date to past | Query successful |
| 3 | Verify expiration | Shows "✅ EXPIRED" |
| 4 | Run expiration function | "Expired 1 yearly subscriptions" |
| 5 | Check new subscription | Free tier, 50K tokens, 2 papers |
| 6 | Check old subscription | Status = "expired" |

---

## What Happens in Production?

In production, this process happens automatically:

1. **Daily at 00:15 UTC**: Cron job `expire-yearly-subscriptions-daily` runs
2. **Function executes**: `expire_yearly_subscriptions()` checks for expired subscriptions
3. **Auto-downgrade**: Users are automatically moved to free tier
4. **Email notification**: (Future feature) Users receive email about expiration

---

## Troubleshooting

### Issue: "Expired 0 yearly subscriptions"

**Cause:** Subscription end date is not actually in the past

**Solution:**
```sql
-- Check the date
SELECT subscription_end_date, NOW()
FROM user_subscriptions
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test@example.com')
AND billing_cycle = 'yearly';
```

Make sure `subscription_end_date < NOW()` is true.

---

### Issue: User still shows old tier in app

**Cause:** Browser cache or session needs refresh

**Solution:**
1. Log out completely
2. Clear browser cache (or use incognito mode)
3. Log back in
4. Check subscription again

---

## Done! ✅

You've successfully tested the yearly subscription expiration flow. The system correctly:
- ✅ Identifies expired yearly subscriptions
- ✅ Marks old subscriptions as expired
- ✅ Creates new free tier subscriptions
- ✅ Resets token and paper usage
- ✅ Maintains payment history

Users can always purchase a new subscription to upgrade from free tier again!
