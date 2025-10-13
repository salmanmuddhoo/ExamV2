-- Add payment verification to token reset for recurring subscriptions
-- For Stripe/PayPal: Check if payment was received before resetting tokens
-- For MCB Juice: Handled separately by expire_non_recurring_subscriptions

-- Add column to track last successful payment date
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMPTZ;

COMMENT ON COLUMN user_subscriptions.last_payment_date IS
  'Date of last successful payment. Used to verify payment before resetting tokens for recurring subscriptions.';

-- Update existing subscriptions to set last_payment_date
UPDATE user_subscriptions
SET last_payment_date = period_start_date
WHERE last_payment_date IS NULL
  AND status = 'active';

-- Update handle_successful_payment to record payment date
CREATE OR REPLACE FUNCTION handle_successful_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_old_limit INTEGER;
  v_old_used INTEGER;
  v_old_remaining INTEGER;
  v_new_limit INTEGER;
  v_new_token_limit_override INTEGER;
  v_subscription_end_date TIMESTAMPTZ;
  v_payment_method RECORD;
  v_is_recurring BOOLEAN;
BEGIN
  -- Only proceed if status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get payment method details to check if recurring
    SELECT * INTO v_payment_method
    FROM payment_methods
    WHERE id = NEW.payment_method_id;

    -- Set is_recurring based on payment method
    IF v_payment_method.requires_manual_approval THEN
      v_is_recurring := FALSE; -- MCB Juice
    ELSE
      v_is_recurring := TRUE; -- Stripe, PayPal
    END IF;

    -- Check if user already has an active subscription (for token carryover calculation)
    SELECT
      COALESCE(us.token_limit_override, st.token_limit) as token_limit,
      us.tokens_used_current_period
    INTO v_old_limit, v_old_used
    FROM user_subscriptions us
    LEFT JOIN subscription_tiers st ON us.tier_id = st.id
    WHERE us.user_id = NEW.user_id
    AND us.status = 'active';

    -- Get the new tier's token limit
    SELECT token_limit INTO v_new_limit
    FROM subscription_tiers
    WHERE id = NEW.tier_id;

    -- Calculate token carryover
    IF v_old_limit IS NOT NULL AND v_new_limit IS NOT NULL THEN
      v_old_remaining := GREATEST(0, v_old_limit - COALESCE(v_old_used, 0));
      IF v_old_remaining > 0 THEN
        v_new_token_limit_override := v_new_limit + v_old_remaining;
      ELSE
        v_new_token_limit_override := NULL;
      END IF;
    ELSE
      v_new_token_limit_override := NULL;
    END IF;

    -- Calculate subscription_end_date for yearly subscriptions
    IF NEW.billing_cycle = 'yearly' THEN
      v_subscription_end_date := NOW() + INTERVAL '1 year';
    ELSE
      v_subscription_end_date := NULL;
    END IF;

    -- Update or create user subscription
    INSERT INTO user_subscriptions (
      user_id,
      tier_id,
      status,
      billing_cycle,
      is_recurring,
      period_start_date,
      period_end_date,
      subscription_end_date,
      selected_grade_id,
      selected_subject_ids,
      token_limit_override,
      tokens_used_current_period,
      papers_accessed_current_period,
      payment_provider,
      last_payment_date,
      cancel_at_period_end,
      cancellation_reason,
      cancellation_requested_at
    )
    VALUES (
      NEW.user_id,
      NEW.tier_id,
      'active',
      NEW.billing_cycle,
      v_is_recurring,
      NOW(),
      CASE
        WHEN NEW.billing_cycle = 'monthly' THEN NOW() + INTERVAL '1 month'
        WHEN NEW.billing_cycle = 'yearly' THEN NOW() + INTERVAL '1 month'
        ELSE NOW() + INTERVAL '1 month'
      END,
      v_subscription_end_date,
      NEW.selected_grade_id,
      NEW.selected_subject_ids,
      v_new_token_limit_override,
      0,
      0,
      (SELECT name FROM payment_methods WHERE id = NEW.payment_method_id),
      NOW(), -- Record payment date
      FALSE,
      NULL,
      NULL
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      tier_id = EXCLUDED.tier_id,
      status = 'active',
      billing_cycle = EXCLUDED.billing_cycle,
      is_recurring = EXCLUDED.is_recurring,
      period_start_date = EXCLUDED.period_start_date,
      period_end_date = EXCLUDED.period_end_date,
      subscription_end_date = EXCLUDED.subscription_end_date,
      selected_grade_id = EXCLUDED.selected_grade_id,
      selected_subject_ids = EXCLUDED.selected_subject_ids,
      token_limit_override = EXCLUDED.token_limit_override,
      tokens_used_current_period = 0,
      papers_accessed_current_period = 0,
      accessed_paper_ids = ARRAY[]::uuid[],
      payment_provider = EXCLUDED.payment_provider,
      last_payment_date = NOW(), -- Update payment date on renewal
      cancel_at_period_end = FALSE,
      cancellation_reason = NULL,
      cancellation_requested_at = NULL,
      updated_at = NOW();

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update reset_subscription_period with payment verification
CREATE OR REPLACE FUNCTION reset_subscription_period()
RETURNS void AS $$
BEGIN
  -- For TEST MODE and initial implementation:
  -- Reset tokens for recurring subscriptions when period expires
  --
  -- For PRODUCTION with Stripe Subscriptions:
  -- This function should be called from Stripe webhook (invoice.payment_succeeded)
  -- OR we check if payment was received within grace period
  --
  -- Current implementation: Trust-based system (resets tokens on date)
  -- Future: Webhook-based system (resets tokens on payment confirmation)

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
    AND cancel_at_period_end = FALSE
    AND (
      billing_cycle = 'monthly'
      OR
      (billing_cycle = 'yearly' AND (subscription_end_date IS NULL OR subscription_end_date > NOW()))
    )
    -- In production, add payment verification:
    -- AND (
    --   last_payment_date IS NULL  -- First period
    --   OR last_payment_date >= period_start_date - INTERVAL '7 days'  -- Payment received in grace period
    -- )
    ;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to suspend subscriptions with failed payments (for future webhook use)
CREATE OR REPLACE FUNCTION suspend_subscription_for_failed_payment(
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Payment failed'
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
BEGIN
  -- Suspend subscription due to failed payment
  UPDATE user_subscriptions
  SET
    status = 'suspended',
    cancellation_reason = p_reason,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND status = 'active';

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, 'Subscription suspended due to failed payment'::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, 'No active subscription found'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN user_subscriptions.last_payment_date IS
  'Timestamp of last successful payment. For production Stripe webhooks to verify payment before resetting tokens.';

COMMENT ON FUNCTION suspend_subscription_for_failed_payment IS
  'Suspends subscription when payment fails. To be called from Stripe webhook (invoice.payment_failed) in production.';

COMMENT ON FUNCTION handle_successful_payment IS
  'Records payment date on successful payment. In production, Stripe webhooks will call this to activate/renew subscriptions.';

COMMENT ON FUNCTION reset_subscription_period IS
  'TEST MODE: Resets tokens based on date (trust-based). PRODUCTION: Should verify payment via last_payment_date or be triggered by Stripe webhook.';
