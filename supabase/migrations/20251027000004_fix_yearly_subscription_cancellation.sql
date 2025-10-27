-- Fix cancelled yearly subscriptions to continue until subscription_end_date
-- Problem: When a yearly subscription is cancelled, it expires at period_end_date (next month)
--          instead of subscription_end_date (end of year)
-- Root Cause: expire_cancelled_subscriptions() checks period_end_date for all subscriptions
--             cancel_subscription_at_period_end() sets is_recurring = FALSE for all cancellations

-- Fix 1: Update cancel_subscription_at_period_end to preserve is_recurring for yearly subscriptions
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
    -- For yearly subscriptions: Keep is_recurring = TRUE so monthly token refills continue
    -- For monthly subscriptions: Set is_recurring = FALSE to stop auto-renewal
    is_recurring = CASE
      WHEN billing_cycle = 'yearly' THEN TRUE  -- Keep TRUE for monthly token refills
      ELSE FALSE                                -- Stop auto-renewal for monthly
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active';

  RETURN QUERY SELECT TRUE, 'Subscription will be cancelled at the end of the billing period'::TEXT, v_subscription.period_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix 2: Update expire_cancelled_subscriptions to check subscription_end_date for yearly subscriptions
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

  -- Downgrade subscriptions that are marked for cancellation and have passed their end date to free tier
  -- For yearly subscriptions: Check subscription_end_date (end of year)
  -- For monthly subscriptions: Check period_end_date (end of month)
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
    updated_at = NOW()
  WHERE
    status = 'active'
    AND cancel_at_period_end = TRUE
    AND v_free_tier_id IS NOT NULL
    AND (
      -- For yearly subscriptions: Check if subscription_end_date has passed
      (billing_cycle = 'yearly' AND subscription_end_date IS NOT NULL AND subscription_end_date <= NOW())
      OR
      -- For monthly/other subscriptions: Check if period_end_date has passed
      (billing_cycle != 'yearly' AND period_end_date <= NOW())
    );

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  RAISE NOTICE 'Downgraded % cancelled subscriptions to free tier', v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix 3: Update reactivate_subscription to correctly restore is_recurring based on billing_cycle
CREATE OR REPLACE FUNCTION reactivate_subscription(p_user_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_subscription RECORD;
  v_should_be_recurring BOOLEAN;
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

  -- Determine if subscription should be recurring based on billing_cycle and payment method
  IF v_subscription.billing_cycle = 'yearly' THEN
    -- Yearly subscriptions: Always TRUE (for monthly token refills)
    v_should_be_recurring := TRUE;
  ELSIF v_subscription.payment_method_id IS NOT NULL THEN
    -- Monthly subscriptions: Based on payment method (FALSE for MCB Juice, TRUE for Stripe/PayPal)
    SELECT NOT requires_manual_approval INTO v_should_be_recurring
    FROM payment_methods
    WHERE id = v_subscription.payment_method_id;
  ELSE
    -- Fallback: FALSE
    v_should_be_recurring := FALSE;
  END IF;

  -- Remove cancellation flag and restore recurring
  UPDATE user_subscriptions
  SET
    cancel_at_period_end = FALSE,
    cancellation_reason = NULL,
    cancellation_requested_at = NULL,
    is_recurring = v_should_be_recurring,
    updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active';

  RETURN QUERY SELECT TRUE, 'Subscription reactivated successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix 4: Fix existing cancelled yearly subscriptions that have is_recurring=FALSE
-- These subscriptions were cancelled before this migration, so they won't get monthly token refills
-- We need to set is_recurring=TRUE so they continue to get tokens until subscription_end_date
UPDATE user_subscriptions
SET
  is_recurring = TRUE,
  updated_at = NOW()
WHERE billing_cycle = 'yearly'
  AND cancel_at_period_end = TRUE
  AND status = 'active'
  AND is_recurring = FALSE
  AND subscription_end_date IS NOT NULL
  AND subscription_end_date > NOW();

-- Comments
COMMENT ON FUNCTION cancel_subscription_at_period_end IS
  'Marks subscription for cancellation at end of billing period. For yearly subscriptions, keeps is_recurring=TRUE so monthly token refills continue until subscription_end_date. For monthly subscriptions, sets is_recurring=FALSE to stop auto-renewal.';

COMMENT ON FUNCTION expire_cancelled_subscriptions IS
  'Processes subscriptions marked for cancellation. For yearly subscriptions, checks subscription_end_date (end of year). For monthly subscriptions, checks period_end_date (end of month).';

COMMENT ON FUNCTION reactivate_subscription IS
  'Removes cancellation flag from subscription. Correctly restores is_recurring based on billing_cycle (yearly=TRUE, monthly=based on payment method).';

-- Verification query
-- Run this to see all cancelled subscriptions and when they will actually expire:
/*
SELECT
  us.user_id,
  p.email,
  st.display_name as tier,
  us.billing_cycle,
  us.cancel_at_period_end,
  us.is_recurring,
  us.period_end_date as next_token_reset,
  us.subscription_end_date as yearly_subscription_ends,
  CASE
    WHEN us.billing_cycle = 'yearly' AND us.subscription_end_date IS NOT NULL THEN
      CASE WHEN us.subscription_end_date <= NOW() THEN 'WILL EXPIRE NOW' ELSE 'Active until ' || us.subscription_end_date::date END
    ELSE
      CASE WHEN us.period_end_date <= NOW() THEN 'WILL EXPIRE NOW' ELSE 'Active until ' || us.period_end_date::date END
  END as actual_expiration
FROM user_subscriptions us
LEFT JOIN profiles p ON us.user_id = p.id
LEFT JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.cancel_at_period_end = TRUE
  AND us.status = 'active'
ORDER BY us.updated_at DESC;
*/
