-- IMMEDIATE FIX: Run this SQL in your Supabase SQL Editor to fix yearly subscriptions
-- This fixes the issue where yearly subscriptions aren't getting monthly token resets

-- This query will:
-- 1. Set the correct subscription_end_date (1 year from creation)
-- 2. Reset the period_end_date for monthly token resets
-- 3. Give back tokens if the period has expired

BEGIN;

-- Fix yearly subscriptions
UPDATE user_subscriptions
SET
  subscription_end_date = CASE
    -- Use creation date + 1 year
    WHEN created_at IS NOT NULL THEN created_at + INTERVAL '1 year'
    -- Fallback to period_start_date + 1 year
    ELSE period_start_date + INTERVAL '1 year'
  END,
  -- Reset period_end_date for monthly token cycles
  period_end_date = CASE
    -- If period has expired, reset to next month from now
    WHEN period_end_date < NOW() THEN NOW() + INTERVAL '1 month'
    -- Otherwise keep existing
    ELSE period_end_date
  END,
  -- Reset tokens if period expired
  tokens_used_current_period = CASE
    WHEN period_end_date < NOW() THEN 0
    ELSE tokens_used_current_period
  END,
  papers_accessed_current_period = CASE
    WHEN period_end_date < NOW() THEN 0
    ELSE papers_accessed_current_period
  END,
  accessed_paper_ids = CASE
    WHEN period_end_date < NOW() THEN ARRAY[]::uuid[]
    ELSE accessed_paper_ids
  END,
  updated_at = NOW()
WHERE
  billing_cycle = 'yearly'
  AND status = 'active'
  AND is_recurring = TRUE;

-- Show what was updated
SELECT
  user_id,
  billing_cycle,
  created_at AS subscription_created,
  subscription_end_date AS yearly_expires,
  period_start_date AS current_period_start,
  period_end_date AS next_token_reset,
  tokens_used_current_period,
  (SELECT token_limit FROM subscription_tiers WHERE id = tier_id) AS monthly_token_limit
FROM user_subscriptions
WHERE billing_cycle = 'yearly'
  AND status = 'active'
ORDER BY created_at DESC;

COMMIT;

-- Expected result:
-- - subscription_end_date: 1 year from when you purchased
-- - period_end_date: Next month (for monthly token resets)
-- - tokens_used_current_period: Reset to 0 if your period had expired
