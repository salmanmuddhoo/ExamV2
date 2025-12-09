-- Migration: Fix Database Functions to Support Daily Billing Cycles
-- This migration updates all subscription management functions to properly handle daily renewals
-- Created: 2025-12-09

-- ============================================================================
-- 1. Update reset_subscription_period() to handle DAILY billing cycles
-- ============================================================================
CREATE OR REPLACE FUNCTION reset_subscription_period()
RETURNS void AS $$
BEGIN
  -- Reset tokens and extend period for all billing cycles:
  -- DAILY: Reset every day, extend by 1 day
  -- MONTHLY: Reset every month, extend by 1 month
  -- YEARLY: Reset every month (for monthly token allotments), extend by 1 month

  UPDATE user_subscriptions
  SET
    tokens_used_current_period = 0,
    papers_accessed_current_period = 0,
    accessed_paper_ids = '{}',
    token_limit_override = NULL, -- Clear token carryover on new period
    period_start_date = NOW(),
    period_end_date = CASE
      -- Daily: extend by 1 day
      WHEN billing_cycle = 'daily' THEN NOW() + INTERVAL '1 day'
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
    AND (
      -- For daily subscriptions: Only reset if recurring (not cancelled)
      (billing_cycle = 'daily' AND is_recurring = TRUE)
      OR
      -- For monthly subscriptions: Only reset if recurring (not cancelled/expired)
      (billing_cycle = 'monthly' AND is_recurring = TRUE)
      OR
      -- For yearly subscriptions: Always reset if subscription hasn't ended
      (billing_cycle = 'yearly' AND (subscription_end_date IS NULL OR subscription_end_date > NOW()))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reset_subscription_period IS
  'Resets token usage for all active subscriptions based on their billing cycle. DAILY subscriptions reset every day. MONTHLY subscriptions reset monthly. YEARLY subscriptions get monthly resets regardless of is_recurring (even if cancelled).';

-- ============================================================================
-- 2. Update expire_cancelled_subscriptions() to handle DAILY billing cycles
-- ============================================================================
CREATE OR REPLACE FUNCTION expire_cancelled_subscriptions()
RETURNS void AS $$
DECLARE
  v_free_tier_id UUID;
BEGIN
  -- Get free tier ID
  SELECT id INTO v_free_tier_id
  FROM subscription_tiers
  WHERE name = 'free' AND is_active = TRUE
  LIMIT 1;

  -- Downgrade subscriptions that are marked for cancellation and have passed their end date
  -- DAILY: Use period_end_date (1 day)
  -- MONTHLY: Use period_end_date (1 month)
  -- YEARLY: Use subscription_end_date (full year)
  UPDATE user_subscriptions
  SET
    tier_id = v_free_tier_id,
    status = 'active',
    billing_cycle = 'monthly',
    is_recurring = FALSE,
    period_start_date = NOW(),
    period_end_date = NOW() + INTERVAL '30 days',
    subscription_end_date = NULL,
    tokens_used_current_period = 0,
    papers_accessed_current_period = 0,
    accessed_paper_ids = ARRAY[]::uuid[],
    token_limit_override = NULL,
    cancel_at_period_end = FALSE,
    cancellation_reason = NULL,
    cancellation_requested_at = NULL,
    selected_grade_id = NULL,
    selected_subject_ids = NULL,
    updated_at = NOW()
  WHERE
    status = 'active'
    AND cancel_at_period_end = TRUE
    AND v_free_tier_id IS NOT NULL
    AND (
      -- For daily subscriptions: Check period_end_date
      (billing_cycle = 'daily' AND period_end_date <= NOW())
      OR
      -- For monthly subscriptions: Check period_end_date
      (billing_cycle = 'monthly' AND period_end_date <= NOW())
      OR
      -- For yearly subscriptions: Check subscription_end_date
      (billing_cycle = 'yearly' AND subscription_end_date IS NOT NULL AND subscription_end_date <= NOW())
    );

  RAISE NOTICE 'Downgraded cancelled subscriptions to free tier';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION expire_cancelled_subscriptions IS
  'Processes subscriptions marked for cancellation. DAILY/MONTHLY: Downgrades when period_end_date is reached. YEARLY: Downgrades when subscription_end_date is reached.';

-- ============================================================================
-- 3. Update cancel_subscription_at_period_end() to handle DAILY billing cycles
-- ============================================================================
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
  -- YEARLY: Keep is_recurring=TRUE so monthly token refills continue
  -- DAILY/MONTHLY: Set is_recurring=FALSE to stop auto-renewal
  UPDATE user_subscriptions
  SET
    cancel_at_period_end = TRUE,
    cancellation_reason = p_reason,
    cancellation_requested_at = NOW(),
    -- Only yearly subscriptions keep is_recurring=TRUE (for monthly token refills)
    -- Daily and monthly subscriptions set is_recurring=FALSE to stop auto-renewal
    is_recurring = CASE
      WHEN billing_cycle = 'yearly' THEN TRUE
      ELSE FALSE
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active';

  RETURN QUERY SELECT TRUE, 'Subscription will be cancelled at the end of the billing period'::TEXT, v_subscription.period_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cancel_subscription_at_period_end IS
  'Marks subscription for cancellation at end of billing period. YEARLY subscriptions keep is_recurring=TRUE for monthly token refills. DAILY/MONTHLY subscriptions set is_recurring=FALSE to stop auto-renewal.';

-- ============================================================================
-- 4. Create helper function to check if a subscription should be reset
-- ============================================================================
CREATE OR REPLACE FUNCTION should_reset_subscription_period(
  p_billing_cycle TEXT,
  p_is_recurring BOOLEAN,
  p_period_end_date TIMESTAMPTZ,
  p_subscription_end_date TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if period has ended
  IF p_period_end_date >= NOW() THEN
    RETURN FALSE;
  END IF;

  -- Check based on billing cycle
  CASE p_billing_cycle
    WHEN 'daily' THEN
      -- Daily subscriptions must be recurring
      RETURN p_is_recurring = TRUE;
    WHEN 'monthly' THEN
      -- Monthly subscriptions must be recurring
      RETURN p_is_recurring = TRUE;
    WHEN 'yearly' THEN
      -- Yearly subscriptions reset monthly until subscription_end_date
      RETURN (p_subscription_end_date IS NULL OR p_subscription_end_date > NOW());
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION should_reset_subscription_period IS
  'Helper function to determine if a subscription period should be reset based on billing cycle and status.';

-- ============================================================================
-- 5. Update handle_successful_payment() trigger to handle DAILY billing cycles
-- ============================================================================
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
  v_period_end_date TIMESTAMPTZ;
BEGIN
  -- Only proceed if status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get payment method details to check if recurring
    SELECT * INTO v_payment_method
    FROM payment_methods
    WHERE id = NEW.payment_method_id;

    -- Set is_recurring based on payment method AND billing cycle
    -- YEARLY: Always is_recurring=TRUE (paid upfront for full year)
    -- DAILY/MONTHLY: Check payment method
    --   - Manual approval (MCB Juice): is_recurring=FALSE
    --   - Auto payment (Stripe/PayPal): is_recurring=TRUE
    IF NEW.billing_cycle = 'yearly' THEN
      v_is_recurring := TRUE;
    ELSIF v_payment_method.requires_manual_approval THEN
      v_is_recurring := FALSE;
    ELSE
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

    -- Calculate subscription_end_date (only for yearly subscriptions)
    IF NEW.billing_cycle = 'yearly' THEN
      v_subscription_end_date := NOW() + INTERVAL '1 year';
    ELSE
      v_subscription_end_date := NULL;
    END IF;

    -- Calculate period_end_date based on billing cycle
    v_period_end_date := CASE
      WHEN NEW.billing_cycle = 'daily' THEN NOW() + INTERVAL '1 day'
      WHEN NEW.billing_cycle = 'monthly' THEN NOW() + INTERVAL '1 month'
      WHEN NEW.billing_cycle = 'yearly' THEN NOW() + INTERVAL '1 month'
      ELSE NOW() + INTERVAL '1 month'
    END;

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
      v_period_end_date,
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
  'Handles subscription activation after successful payment. YEARLY subscriptions set is_recurring=TRUE (paid upfront). DAILY/MONTHLY subscriptions check payment method (manual=FALSE, auto=TRUE). Period end dates: DAILY=1 day, MONTHLY=1 month, YEARLY=1 month (for token resets).';

-- ============================================================================
-- 6. Add index to improve performance of daily subscription queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_billing_cycle
ON user_subscriptions(billing_cycle) WHERE status = 'active';

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the changes work:
-- SELECT
--   'Daily Subscription Support' as check_name,
--   billing_cycle,
--   COUNT(*) as subscription_count,
--   COUNT(*) FILTER (WHERE is_recurring = TRUE) as recurring_count,
--   COUNT(*) FILTER (WHERE period_end_date < NOW()) as needs_reset_count
-- FROM user_subscriptions
-- WHERE status = 'active'
-- GROUP BY billing_cycle
-- ORDER BY billing_cycle;
