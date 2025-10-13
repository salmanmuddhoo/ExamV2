-- Set up automated cron jobs for subscription management
-- These jobs run daily to handle token resets, expirations, and downgrades

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on cron schema to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule daily job to reset subscription periods (runs at 00:01 UTC every day)
-- This resets tokens monthly for all recurring subscriptions
SELECT cron.schedule(
  'reset-subscription-periods-daily',  -- Job name
  '1 0 * * *',                          -- Cron expression: every day at 00:01 UTC
  $$SELECT reset_subscription_period();$$
);

-- Schedule daily job to expire non-recurring subscriptions (runs at 00:05 UTC)
-- This handles MCB Juice subscriptions that have ended
SELECT cron.schedule(
  'expire-non-recurring-subscriptions-daily',
  '5 0 * * *',
  $$SELECT expire_non_recurring_subscriptions();$$
);

-- Schedule daily job to expire cancelled subscriptions (runs at 00:10 UTC)
-- This downgrades users who cancelled and reached their period end date
SELECT cron.schedule(
  'expire-cancelled-subscriptions-daily',
  '10 0 * * *',
  $$SELECT expire_cancelled_subscriptions();$$
);

-- Schedule daily job to expire yearly subscriptions (runs at 00:15 UTC)
-- This handles yearly subscriptions that have reached their 1-year mark
SELECT cron.schedule(
  'expire-yearly-subscriptions-daily',
  '15 0 * * *',
  $$SELECT expire_yearly_subscriptions();$$
);

-- Create a manual trigger function for testing/immediate execution
-- Admins can call this to manually trigger all subscription maintenance tasks
CREATE OR REPLACE FUNCTION run_subscription_maintenance()
RETURNS TABLE (
  task TEXT,
  success BOOLEAN,
  message TEXT
) AS $$
BEGIN
  -- Reset subscription periods
  BEGIN
    PERFORM reset_subscription_period();
    RETURN QUERY SELECT 'reset_subscription_period'::TEXT, TRUE, 'Successfully reset subscription periods'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'reset_subscription_period'::TEXT, FALSE, SQLERRM::TEXT;
  END;

  -- Expire non-recurring subscriptions
  BEGIN
    PERFORM expire_non_recurring_subscriptions();
    RETURN QUERY SELECT 'expire_non_recurring_subscriptions'::TEXT, TRUE, 'Successfully expired non-recurring subscriptions'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'expire_non_recurring_subscriptions'::TEXT, FALSE, SQLERRM::TEXT;
  END;

  -- Expire cancelled subscriptions
  BEGIN
    PERFORM expire_cancelled_subscriptions();
    RETURN QUERY SELECT 'expire_cancelled_subscriptions'::TEXT, TRUE, 'Successfully expired cancelled subscriptions'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'expire_cancelled_subscriptions'::TEXT, FALSE, SQLERRM::TEXT;
  END;

  -- Expire yearly subscriptions
  BEGIN
    PERFORM expire_yearly_subscriptions();
    RETURN QUERY SELECT 'expire_yearly_subscriptions'::TEXT, TRUE, 'Successfully expired yearly subscriptions'::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'expire_yearly_subscriptions'::TEXT, FALSE, SQLERRM::TEXT;
  END;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (for admin testing)
GRANT EXECUTE ON FUNCTION run_subscription_maintenance TO authenticated;

-- View scheduled jobs
COMMENT ON FUNCTION run_subscription_maintenance IS
  'Manually runs all subscription maintenance tasks. Use for testing or immediate execution. Returns status of each task.';

-- To view all scheduled cron jobs, run:
-- SELECT * FROM cron.job;

-- To manually run subscription maintenance immediately for testing:
-- SELECT * FROM run_subscription_maintenance();

-- To unschedule a job (if needed):
-- SELECT cron.unschedule('job-name');
