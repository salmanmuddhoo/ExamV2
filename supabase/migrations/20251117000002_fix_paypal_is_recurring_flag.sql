-- Fix is_recurring flag to respect payment_type for PayPal dual payments
-- This ensures one-time PayPal payments are marked as non-recurring
-- and recurring PayPal subscriptions are marked as recurring

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

    -- Get payment method details
    SELECT * INTO v_payment_method
    FROM payment_methods
    WHERE id = NEW.payment_method_id;

    -- Set is_recurring based on payment_type (for PayPal dual payments) or payment method
    -- Priority order:
    -- 1. Check payment_type field (for PayPal one_time vs recurring)
    -- 2. Check billing_cycle (yearly is always recurring - paid upfront)
    -- 3. Check payment method (manual approval vs automatic)

    IF NEW.payment_type IS NOT NULL THEN
      -- PayPal dual payment: Use payment_type field
      IF NEW.payment_type = 'recurring' THEN
        v_is_recurring := TRUE;  -- PayPal recurring subscription
      ELSE
        v_is_recurring := FALSE; -- PayPal one-time payment
      END IF;
    ELSIF NEW.billing_cycle = 'yearly' THEN
      -- Yearly subscriptions are always recurring (paid upfront for full year)
      v_is_recurring := TRUE;
    ELSIF v_payment_method.requires_manual_approval THEN
      -- Monthly MCB Juice: non-recurring (need manual payment each month)
      v_is_recurring := FALSE;
    ELSE
      -- Monthly Stripe/other auto-payment: recurring (auto-renewal)
      v_is_recurring := TRUE;
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

    -- Calculate subscription_end_date based on payment_type and billing_cycle
    IF NEW.payment_type = 'one_time' AND NEW.billing_cycle = 'monthly' THEN
      -- One-time monthly payment: expires after 1 month (not auto-renewed)
      v_subscription_end_date := NOW() + INTERVAL '1 month';
    ELSIF NEW.billing_cycle = 'yearly' THEN
      -- Yearly subscription: expires after 1 year
      v_subscription_end_date := NOW() + INTERVAL '1 year';
    ELSE
      -- Recurring monthly: no end date (renews indefinitely)
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
      NOW(),
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
      last_payment_date = NOW(),
      cancel_at_period_end = FALSE,
      cancellation_reason = NULL,
      cancellation_requested_at = NULL,
      updated_at = NOW();

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION handle_successful_payment IS
  'Handles subscription activation after successful payment. Respects payment_type field for PayPal dual payments (one_time vs recurring). For YEARLY subscriptions, sets is_recurring=TRUE (paid upfront). For MONTHLY MCB Juice, sets is_recurring=FALSE (manual payment). Sets subscription_end_date based on payment_type and billing_cycle.';
