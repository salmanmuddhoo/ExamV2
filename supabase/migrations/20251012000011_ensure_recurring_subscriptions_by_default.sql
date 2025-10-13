-- Ensure all monthly/yearly subscriptions are recurring by default
-- Only MCB Juice (manual payment) should be non-recurring
-- When users cancel, they keep access until period ends, then downgrade to free

-- Update payment handler to set is_recurring based on payment method
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
    -- Stripe and PayPal = recurring (auto-renews)
    -- MCB Juice = non-recurring (manual payment each time)
    IF v_payment_method.requires_manual_approval THEN
      v_is_recurring := FALSE; -- MCB Juice
    ELSE
      v_is_recurring := TRUE; -- Stripe, PayPal (auto-recurring)
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
      -- Calculate remaining tokens from old subscription
      v_old_remaining := GREATEST(0, v_old_limit - COALESCE(v_old_used, 0));

      -- If user has remaining tokens, add them to new tier limit
      IF v_old_remaining > 0 THEN
        v_new_token_limit_override := v_new_limit + v_old_remaining;
      ELSE
        v_new_token_limit_override := NULL; -- No override needed
      END IF;
    ELSE
      v_new_token_limit_override := NULL; -- No carryover for unlimited tiers
    END IF;

    -- Calculate subscription_end_date for yearly subscriptions
    IF NEW.billing_cycle = 'yearly' THEN
      v_subscription_end_date := NOW() + INTERVAL '1 year';
    ELSE
      v_subscription_end_date := NULL;
    END IF;

    -- Update or create user subscription with token carryover
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
      cancel_at_period_end,
      cancellation_reason,
      cancellation_requested_at
    )
    VALUES (
      NEW.user_id,
      NEW.tier_id,
      'active',
      NEW.billing_cycle,
      v_is_recurring, -- TRUE for Stripe/PayPal, FALSE for MCB Juice
      NOW(),
      CASE
        WHEN NEW.billing_cycle = 'monthly' THEN NOW() + INTERVAL '1 month'
        WHEN NEW.billing_cycle = 'yearly' THEN NOW() + INTERVAL '1 month' -- Monthly token reset
        ELSE NOW() + INTERVAL '1 month'
      END,
      v_subscription_end_date, -- Set yearly subscription end date
      NEW.selected_grade_id,
      NEW.selected_subject_ids,
      v_new_token_limit_override,
      0, -- Reset usage to 0
      0, -- Reset papers to 0
      (SELECT name FROM payment_methods WHERE id = NEW.payment_method_id),
      FALSE, -- Reset cancellation flag on new purchase
      NULL,  -- Clear cancellation reason
      NULL   -- Clear cancellation timestamp
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      tier_id = EXCLUDED.tier_id,
      status = 'active',
      billing_cycle = EXCLUDED.billing_cycle,
      is_recurring = EXCLUDED.is_recurring, -- Update based on payment method
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
      cancel_at_period_end = FALSE, -- Reset on renewal/upgrade
      cancellation_reason = NULL,
      cancellation_requested_at = NULL,
      updated_at = NOW();

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update reset_subscription_period to respect cancel_at_period_end flag
-- Don't auto-renew subscriptions that are marked for cancellation
CREATE OR REPLACE FUNCTION reset_subscription_period()
RETURNS void AS $$
BEGIN
  -- For MONTHLY subscriptions: Reset tokens monthly and extend period by 1 month
  -- For YEARLY subscriptions: Reset tokens monthly but check subscription hasn't expired
  -- Skip subscriptions marked for cancellation (cancel_at_period_end = TRUE)
  -- Non-recurring subscriptions are handled by expire_non_recurring_subscriptions()

  UPDATE user_subscriptions
  SET
    tokens_used_current_period = 0,
    papers_accessed_current_period = 0,
    accessed_paper_ids = '{}',
    token_limit_override = NULL, -- Clear token carryover on new period
    period_start_date = NOW(),
    period_end_date = CASE
      -- Monthly: extend by 1 month
      WHEN billing_cycle = 'monthly' THEN NOW() + INTERVAL '1 month'
      -- Yearly: extend by 1 month for monthly token resets
      WHEN billing_cycle = 'yearly' THEN NOW() + INTERVAL '1 month'
      ELSE period_end_date
    END,
    updated_at = NOW()
  WHERE
    status = 'active'
    AND period_end_date < NOW()
    AND is_recurring = TRUE -- Only auto-renew recurring subscriptions
    AND cancel_at_period_end = FALSE -- Don't renew if user cancelled
    AND (
      -- For monthly subscriptions, just check period_end_date
      billing_cycle = 'monthly'
      OR
      -- For yearly subscriptions, also check that subscription hasn't ended
      (billing_cycle = 'yearly' AND (subscription_end_date IS NULL OR subscription_end_date > NOW()))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION handle_successful_payment IS
  'Handles subscription activation after successful payment. Sets is_recurring=TRUE for Stripe/PayPal (auto-recurring), is_recurring=FALSE for MCB Juice (manual). Implements token carryover and sets subscription_end_date for yearly subscriptions.';

COMMENT ON FUNCTION reset_subscription_period IS
  'Resets token usage monthly for active recurring subscriptions. Skips subscriptions marked for cancellation (cancel_at_period_end=TRUE). Yearly subscriptions get monthly token resets but maintain year-long subscription via subscription_end_date.';
