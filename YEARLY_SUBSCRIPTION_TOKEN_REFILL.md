# Yearly Subscription Monthly Token Refill System

## Overview

This document explains how the monthly token refill system works for yearly subscriptions in the ExamV2 application.

## How It Works

When a student purchases a **yearly subscription** for any tier (Student Lite, Student, or Pro), they receive:

1. **Monthly Token Allocations** - Their token limit is refilled every month
2. **Full Year Access** - The subscription lasts for 365 days from purchase
3. **Automatic Management** - Token resets and subscription expiration are handled automatically

### Example: Pro Package Yearly Subscription

- **Purchase Date**: January 1, 2025
- **Token Allocation**: 1,000,000 tokens per month (or unlimited for Pro)
- **Billing**: Paid $250 for the full year upfront

**What Happens Each Month:**
- **Month 1 (Jan 1 - Jan 31)**: User gets 1M tokens, uses 800K tokens
- **Month 2 (Feb 1 - Feb 28)**: Tokens reset to 1M (starts fresh, doesn't carry over the 200K unused)
- **Month 3 (Mar 1 - Mar 31)**: Tokens reset to 1M again
- ...continues monthly...
- **Month 12 (Dec 1 - Dec 31)**: Tokens reset to 1M for the last month
- **Month 13 (Jan 1, 2026)**: Subscription expires, user downgraded to free tier

## Database Schema

### Key Fields in `user_subscriptions` Table

```sql
CREATE TABLE user_subscriptions (
  -- ... other fields ...

  billing_cycle TEXT,                    -- 'monthly' or 'yearly'
  is_recurring BOOLEAN,                  -- TRUE for auto-renewal subscriptions

  -- Token tracking for CURRENT PERIOD (monthly)
  tokens_used_current_period INTEGER,    -- Resets to 0 every month
  period_start_date TIMESTAMPTZ,         -- Start of current monthly period
  period_end_date TIMESTAMPTZ,           -- End of current monthly period (1 month from start)

  -- Subscription tracking for YEARLY subscriptions
  subscription_end_date TIMESTAMPTZ,     -- When the yearly subscription actually expires (1 year from purchase)

  -- ... other fields ...
);
```

### Understanding the Date Fields

For **Monthly Subscriptions**:
- `period_start_date`: Start of billing month
- `period_end_date`: End of billing month (same as subscription end)
- `subscription_end_date`: NULL (not used)

For **Yearly Subscriptions**:
- `period_start_date`: Start of current monthly token period
- `period_end_date`: End of current monthly token period (1 month from start)
- `subscription_end_date`: When the yearly subscription expires (1 year from purchase)

**Example for Yearly Subscription purchased Jan 1, 2025:**

| Date | period_start_date | period_end_date | subscription_end_date |
|------|-------------------|-----------------|----------------------|
| Jan 1 | Jan 1, 2025 | Feb 1, 2025 | Jan 1, 2026 |
| Feb 1 | Feb 1, 2025 | Mar 1, 2025 | Jan 1, 2026 |
| Mar 1 | Mar 1, 2025 | Apr 1, 2025 | Jan 1, 2026 |
| ... | ... | ... | ... |
| Dec 1 | Dec 1, 2025 | Jan 1, 2026 | Jan 1, 2026 |
| Jan 1, 2026 | **Subscription Expires** | | |

## Automated Functions

### 1. `reset_subscription_period()`

**Purpose**: Resets token usage monthly for all active subscriptions

**Runs**: Daily at 00:01 UTC via cron job

**What It Does**:
- Checks all active subscriptions where `period_end_date < NOW()`
- For **Monthly subscriptions**: Resets tokens and extends period by 1 month
- For **Yearly subscriptions**:
  - Resets tokens to 0
  - Extends `period_end_date` by 1 month
  - Checks that `subscription_end_date` hasn't been reached
  - If subscription hasn't expired, continues monthly resets

**Code**:
```sql
CREATE OR REPLACE FUNCTION reset_subscription_period()
RETURNS void AS $$
BEGIN
  UPDATE user_subscriptions
  SET
    tokens_used_current_period = 0,
    papers_accessed_current_period = 0,
    accessed_paper_ids = '{}',
    token_limit_override = NULL,
    period_start_date = NOW(),
    period_end_date = CASE
      WHEN billing_cycle = 'monthly' THEN NOW() + INTERVAL '1 month'
      WHEN billing_cycle = 'yearly' THEN NOW() + INTERVAL '1 month'
      ELSE period_end_date
    END,
    updated_at = NOW()
  WHERE
    status = 'active'
    AND period_end_date < NOW()
    AND is_recurring = TRUE
    AND (
      billing_cycle = 'monthly'
      OR
      (billing_cycle = 'yearly' AND (subscription_end_date IS NULL OR subscription_end_date > NOW()))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. `expire_yearly_subscriptions()`

**Purpose**: Expires yearly subscriptions when they reach their 1-year mark

**Runs**: Daily at 00:15 UTC via cron job

**What It Does**:
- Finds all yearly subscriptions where `subscription_end_date < NOW()`
- Marks them as 'expired'
- Automatically downgrades users to the free tier
- Users start with fresh free tier limits (50K tokens, 2 papers per month)

**Code**:
```sql
CREATE OR REPLACE FUNCTION expire_yearly_subscriptions()
RETURNS void AS $$
DECLARE
  v_free_tier_id UUID;
BEGIN
  SELECT id INTO v_free_tier_id
  FROM subscription_tiers
  WHERE name = 'free' AND is_active = TRUE
  LIMIT 1;

  WITH expired_subs AS (
    UPDATE user_subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active'
      AND billing_cycle = 'yearly'
      AND subscription_end_date IS NOT NULL
      AND subscription_end_date < NOW()
    RETURNING user_id
  )
  INSERT INTO user_subscriptions (
    user_id, tier_id, status, billing_cycle, is_recurring,
    period_start_date, period_end_date,
    tokens_used_current_period, papers_accessed_current_period
  )
  SELECT
    user_id, v_free_tier_id, 'active', 'monthly', FALSE,
    NOW(), NOW() + INTERVAL '30 days', 0, 0
  FROM expired_subs
  ON CONFLICT (user_id) DO UPDATE SET
    tier_id = v_free_tier_id,
    status = 'active',
    billing_cycle = 'monthly',
    is_recurring = FALSE,
    period_start_date = NOW(),
    period_end_date = NOW() + INTERVAL '30 days',
    tokens_used_current_period = 0,
    papers_accessed_current_period = 0,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3. `handle_successful_payment()`

**Purpose**: Activates subscription after successful payment

**Triggered**: When payment status changes to 'completed'

**What It Does**:
- For **Yearly subscriptions**:
  - Sets `subscription_end_date` to NOW() + 1 year
  - Sets `period_end_date` to NOW() + 1 month (for monthly token resets)
  - Resets token usage to 0
- For **Monthly subscriptions**:
  - Sets `period_end_date` to NOW() + 1 month
  - `subscription_end_date` remains NULL

**Key Code Section**:
```sql
-- Calculate subscription_end_date for yearly subscriptions
IF NEW.billing_cycle = 'yearly' THEN
  v_subscription_end_date := NOW() + INTERVAL '1 year';
ELSE
  v_subscription_end_date := NULL;
END IF;

-- Set period dates
period_start_date = NOW(),
period_end_date = CASE
  WHEN NEW.billing_cycle = 'monthly' THEN NOW() + INTERVAL '1 month'
  WHEN NEW.billing_cycle = 'yearly' THEN NOW() + INTERVAL '1 month' -- Monthly token reset
  ELSE NOW() + INTERVAL '1 month'
END,
subscription_end_date = v_subscription_end_date
```

## Cron Jobs

All subscription maintenance tasks are automated via pg_cron:

| Job Name | Schedule | Function | Purpose |
|----------|----------|----------|---------|
| `reset-subscription-periods-daily` | 00:01 UTC | `reset_subscription_period()` | Monthly token resets |
| `expire-non-recurring-subscriptions-daily` | 00:05 UTC | `expire_non_recurring_subscriptions()` | Expire MCB Juice subscriptions |
| `expire-cancelled-subscriptions-daily` | 00:10 UTC | `expire_cancelled_subscriptions()` | Downgrade cancelled subscriptions |
| `expire-yearly-subscriptions-daily` | 00:15 UTC | `expire_yearly_subscriptions()` | Expire yearly subscriptions |

**View Cron Jobs**:
```sql
SELECT * FROM cron.job;
```

**Manual Testing**:
```sql
-- Test all subscription maintenance tasks at once
SELECT * FROM run_subscription_maintenance();
```

## User Interface Updates

### SubscriptionManager Component

For yearly subscriptions, the UI now shows:

- **Next Token Reset**: When tokens will refill next month
- **Subscription Ends**: When the yearly subscription expires

**Example Display**:
```
Current Subscription: Pro Package (Yearly)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: Active
Tokens: 250,000 / 1,000,000
Next Token Reset: February 1, 2025
Subscription Ends: January 1, 2026
```

For monthly subscriptions:
```
Current Subscription: Pro Package (Monthly)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: Active
Tokens: 250,000 / 1,000,000
Period: January 1, 2025 - February 1, 2025
```

### Cancellation Behavior

When a user cancels a yearly subscription:
- Subscription remains active until `subscription_end_date`
- Tokens continue to refill monthly until expiration
- After expiration, user is downgraded to free tier

**UI Message**:
```
⚠️ Subscription Scheduled for Cancellation

Your subscription will end on January 1, 2026. You'll continue
to have full access until then. Your tokens will continue to
refill monthly until your subscription ends.

[Reactivate Subscription]
```

## Token Allocation by Tier

| Tier | Monthly | Yearly | Tokens per Month | Papers |
|------|---------|--------|------------------|--------|
| **Free** | $0 | - | 50,000 | 2 |
| **Student Lite** | $8 | $80 | 250,000 | Unlimited |
| **Student** | $15 | $150 | 500,000 | Unlimited |
| **Pro** | $25 | $250 | Unlimited | Unlimited |

**Note**: For yearly subscriptions, users pay the yearly price upfront and get monthly token allocations for the entire year.

## Testing the System

### Test Queries

**1. Check Yearly Subscriptions**:
```sql
SELECT
  us.id,
  us.user_id,
  p.email,
  st.display_name as tier,
  us.billing_cycle,
  us.period_start_date,
  us.period_end_date,
  us.subscription_end_date,
  us.tokens_used_current_period,
  st.token_limit
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.billing_cycle = 'yearly'
  AND us.status = 'active'
ORDER BY us.period_end_date;
```

**2. Check Which Subscriptions Need Token Reset**:
```sql
SELECT
  us.id,
  p.email,
  st.display_name as tier,
  us.period_end_date,
  us.subscription_end_date,
  CASE
    WHEN us.period_end_date < NOW() THEN 'NEEDS RESET'
    ELSE 'OK'
  END as reset_status,
  CASE
    WHEN us.billing_cycle = 'yearly' AND us.subscription_end_date < NOW() THEN 'NEEDS EXPIRATION'
    ELSE 'OK'
  END as expiration_status
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.status = 'active'
ORDER BY us.period_end_date;
```

**3. Manually Trigger Token Reset (for testing)**:
```sql
-- This will reset tokens for any subscriptions that have passed their period_end_date
SELECT reset_subscription_period();

-- View results
SELECT
  p.email,
  us.tokens_used_current_period,
  us.period_start_date,
  us.period_end_date
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
WHERE us.status = 'active';
```

**4. Manually Expire Yearly Subscriptions (for testing)**:
```sql
-- This will expire any yearly subscriptions that have passed their subscription_end_date
SELECT expire_yearly_subscriptions();

-- Check expired subscriptions
SELECT
  p.email,
  us.status,
  us.billing_cycle,
  us.subscription_end_date,
  st.display_name as tier
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.status = 'expired'
ORDER BY us.updated_at DESC
LIMIT 10;
```

### Manual Testing Steps

1. **Create a test yearly subscription**:
   - Use Stripe test mode or PayPal sandbox
   - Purchase a yearly subscription for any tier
   - Verify `subscription_end_date` is set to 1 year from now
   - Verify `period_end_date` is set to 1 month from now

2. **Manually adjust dates for testing**:
   ```sql
   -- WARNING: Only do this in development/staging!
   UPDATE user_subscriptions
   SET period_end_date = NOW() - INTERVAL '1 day'
   WHERE user_id = 'YOUR_USER_ID'
     AND status = 'active';

   -- Then run the reset function
   SELECT reset_subscription_period();

   -- Verify tokens were reset
   SELECT tokens_used_current_period FROM user_subscriptions
   WHERE user_id = 'YOUR_USER_ID';
   ```

3. **Test yearly subscription expiration**:
   ```sql
   -- WARNING: Only do this in development/staging!
   UPDATE user_subscriptions
   SET subscription_end_date = NOW() - INTERVAL '1 day'
   WHERE user_id = 'YOUR_USER_ID'
     AND billing_cycle = 'yearly';

   -- Then run the expiration function
   SELECT expire_yearly_subscriptions();

   -- Verify user was downgraded to free tier
   SELECT st.display_name
   FROM user_subscriptions us
   JOIN subscription_tiers st ON us.tier_id = st.id
   WHERE us.user_id = 'YOUR_USER_ID' AND us.status = 'active';
   ```

## Troubleshooting

### Issue: Tokens Not Resetting Monthly

**Check**:
1. Verify cron job is running:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'reset-subscription-periods-daily';
   ```

2. Check if `period_end_date` has passed:
   ```sql
   SELECT
     user_id,
     period_end_date,
     NOW() as current_time,
     CASE WHEN period_end_date < NOW() THEN 'SHOULD RESET' ELSE 'NOT YET' END
   FROM user_subscriptions
   WHERE status = 'active';
   ```

3. Manually trigger reset:
   ```sql
   SELECT reset_subscription_period();
   ```

### Issue: Yearly Subscription Not Expiring

**Check**:
1. Verify expiration cron job:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'expire-yearly-subscriptions-daily';
   ```

2. Check if `subscription_end_date` has passed:
   ```sql
   SELECT
     user_id,
     subscription_end_date,
     NOW() as current_time,
     CASE WHEN subscription_end_date < NOW() THEN 'SHOULD EXPIRE' ELSE 'STILL ACTIVE' END
   FROM user_subscriptions
   WHERE billing_cycle = 'yearly' AND status = 'active';
   ```

3. Manually trigger expiration:
   ```sql
   SELECT expire_yearly_subscriptions();
   ```

### Issue: New Yearly Subscription Has Wrong Dates

**Check Payment Handler**:
```sql
-- Verify the handle_successful_payment() function is working
SELECT * FROM payment_transactions
WHERE status = 'completed'
ORDER BY created_at DESC
LIMIT 5;

-- Check corresponding subscriptions
SELECT
  us.*,
  pt.billing_cycle as payment_billing_cycle,
  pt.created_at as payment_date
FROM user_subscriptions us
JOIN payment_transactions pt ON us.user_id = pt.user_id
WHERE pt.status = 'completed'
ORDER BY pt.created_at DESC
LIMIT 5;
```

## Migration Files

The monthly token refill system for yearly subscriptions is implemented across these migrations:

| File | Purpose |
|------|---------|
| `20251010000004_create_subscription_system.sql` | Initial subscription system |
| `20251011000002_create_payment_system.sql` | Payment system and triggers |
| `20251012000010_fix_yearly_subscription_monthly_reset.sql` | **Main implementation of yearly subscription monthly resets** |
| `20251012000012_setup_subscription_cron_jobs.sql` | Automated cron jobs |

## Summary

The monthly token refill system for yearly subscriptions works as follows:

1. ✅ User purchases yearly subscription → `subscription_end_date` set to +1 year
2. ✅ Token usage tracked monthly via `period_end_date` (+1 month)
3. ✅ Daily cron job resets tokens monthly until subscription expires
4. ✅ After 1 year, subscription expires and user downgraded to free tier
5. ✅ UI clearly shows next token reset date and subscription end date

**This ensures yearly subscribers get their monthly token allocation refreshed every month for the entire duration of their yearly subscription!**
