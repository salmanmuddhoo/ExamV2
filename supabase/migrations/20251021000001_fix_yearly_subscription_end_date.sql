-- Fix subscription_end_date for yearly subscriptions
-- The previous migration incorrectly set subscription_end_date = period_end_date
-- This caused yearly subscriptions to expire prematurely when period_end_date passed

-- For yearly subscriptions, subscription_end_date should be 1 year from creation
-- We'll calculate this based on the creation date or period_start_date

UPDATE user_subscriptions
SET
  subscription_end_date = CASE
    -- If we have a creation date (created_at), use that + 1 year
    WHEN created_at IS NOT NULL THEN created_at + INTERVAL '1 year'
    -- Otherwise, use period_start_date + 1 year as fallback
    ELSE period_start_date + INTERVAL '1 year'
  END,
  -- Also ensure period_end_date is set correctly for monthly token resets
  period_end_date = CASE
    -- If period has already passed, set it to next month from now
    WHEN period_end_date < NOW() THEN NOW() + INTERVAL '1 month'
    -- Otherwise keep the existing period_end_date
    ELSE period_end_date
  END,
  -- Reset tokens if period has expired
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
  AND (
    -- Fix subscriptions with incorrect subscription_end_date
    subscription_end_date IS NULL
    OR subscription_end_date < NOW()
    OR subscription_end_date <= period_end_date  -- Also fix where it was set to period_end_date
  );

-- Add a helpful comment
COMMENT ON COLUMN user_subscriptions.subscription_end_date IS
  'For yearly subscriptions, this is set to 1 year from purchase date. For monthly subscriptions, this is NULL. The period_end_date tracks monthly token reset dates for both billing cycles.';
