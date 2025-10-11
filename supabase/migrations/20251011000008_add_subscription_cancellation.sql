-- Add subscription cancellation support
-- Users can cancel but retain access until end of billing period

-- Step 1: Add cancellation tracking columns
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ;

-- Create index for finding subscriptions that need to be cancelled
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_cancel_at_period_end
  ON user_subscriptions(cancel_at_period_end, period_end_date)
  WHERE cancel_at_period_end = TRUE AND status = 'active';

-- Step 2: Create function to cancel subscription at period end
CREATE OR REPLACE FUNCTION cancel_subscription_at_period_end(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  period_end_date TIMESTAMPTZ
) AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get active subscription
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id AND status = 'active'
  LIMIT 1;

  IF v_subscription IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No active subscription found'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Check if already cancelled
  IF v_subscription.cancel_at_period_end THEN
    RETURN QUERY SELECT FALSE, 'Subscription is already scheduled for cancellation'::TEXT, v_subscription.period_end_date;
    RETURN;
  END IF;

  -- Mark subscription for cancellation at period end
  UPDATE user_subscriptions
  SET
    cancel_at_period_end = TRUE,
    cancellation_reason = p_reason,
    cancellation_requested_at = NOW(),
    is_recurring = FALSE, -- Stop auto-renewal
    updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active';

  RETURN QUERY SELECT TRUE, 'Subscription will be cancelled at the end of the billing period'::TEXT, v_subscription.period_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create function to reactivate a cancelled subscription
CREATE OR REPLACE FUNCTION reactivate_subscription(p_user_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get subscription marked for cancellation
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND cancel_at_period_end = TRUE
  LIMIT 1;

  IF v_subscription IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No subscription scheduled for cancellation found'::TEXT;
    RETURN;
  END IF;

  -- Remove cancellation flag and restore recurring if payment method supports it
  UPDATE user_subscriptions
  SET
    cancel_at_period_end = FALSE,
    cancellation_reason = NULL,
    cancellation_requested_at = NULL,
    -- Restore is_recurring based on payment method
    is_recurring = CASE
      WHEN payment_method_id IS NOT NULL THEN
        (SELECT NOT requires_manual_approval FROM payment_methods WHERE id = payment_method_id)
      ELSE FALSE
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active';

  RETURN QUERY SELECT TRUE, 'Subscription reactivated successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Update the expiration function to handle cancelled subscriptions
CREATE OR REPLACE FUNCTION expire_cancelled_subscriptions()
RETURNS void AS $$
DECLARE
  v_free_tier_id UUID;
  v_expired_count INTEGER := 0;
BEGIN
  -- Get free tier ID
  SELECT id INTO v_free_tier_id
  FROM subscription_tiers
  WHERE name = 'free' AND is_active = TRUE
  LIMIT 1;

  -- Expire subscriptions that are marked for cancellation and have passed their end date
  WITH expired_subs AS (
    UPDATE user_subscriptions
    SET
      status = 'cancelled',
      updated_at = NOW()
    WHERE
      status = 'active'
      AND cancel_at_period_end = TRUE
      AND period_end_date <= NOW()
    RETURNING user_id
  )
  SELECT COUNT(*) INTO v_expired_count FROM expired_subs;

  -- Create free tier subscriptions for users whose subscriptions were cancelled
  INSERT INTO user_subscriptions (
    user_id,
    tier_id,
    status,
    billing_cycle,
    is_recurring,
    period_start_date,
    period_end_date
  )
  SELECT
    es.user_id,
    v_free_tier_id,
    'active',
    'monthly',
    FALSE,
    NOW(),
    NOW() + INTERVAL '30 days'
  FROM (
    SELECT DISTINCT user_id
    FROM user_subscriptions
    WHERE status = 'cancelled'
      AND user_id NOT IN (
        SELECT user_id
        FROM user_subscriptions
        WHERE status = 'active'
      )
  ) es
  WHERE v_free_tier_id IS NOT NULL
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'Expired % cancelled subscriptions', v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Update the combined expiration function to handle both types
CREATE OR REPLACE FUNCTION process_subscription_expirations()
RETURNS void AS $$
BEGIN
  -- Expire non-recurring subscriptions (MCB Juice)
  PERFORM expire_non_recurring_subscriptions();

  -- Expire cancelled subscriptions at period end
  PERFORM expire_cancelled_subscriptions();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: RLS policies are already in place from previous migrations
-- Users will use the cancel_subscription_at_period_end() and reactivate_subscription() functions
-- These functions run with SECURITY DEFINER so they bypass RLS and handle updates safely

-- Step 7: Add comments
COMMENT ON COLUMN user_subscriptions.cancel_at_period_end IS
  'TRUE if user has requested cancellation. Subscription remains active until period_end_date, then status changes to cancelled.';

COMMENT ON COLUMN user_subscriptions.cancellation_reason IS
  'Optional reason provided by user when cancelling subscription.';

COMMENT ON COLUMN user_subscriptions.cancellation_requested_at IS
  'Timestamp when user requested cancellation.';

COMMENT ON FUNCTION cancel_subscription_at_period_end IS
  'Marks subscription for cancellation at end of billing period. User retains access until period_end_date.';

COMMENT ON FUNCTION reactivate_subscription IS
  'Removes cancellation flag from subscription, allowing it to continue beyond the current period.';

COMMENT ON FUNCTION expire_cancelled_subscriptions IS
  'Processes subscriptions marked for cancellation that have reached their period_end_date.';

COMMENT ON FUNCTION process_subscription_expirations IS
  'Main function to run daily via cron. Handles both non-recurring expirations and cancelled subscriptions.';
