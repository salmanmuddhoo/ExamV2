-- Fix cancelled yearly subscriptions to continue receiving monthly token refills
-- Issue: When user cancels yearly subscription, is_recurring is set to FALSE
--        This prevents monthly token refills even though they paid for the full year
-- Solution: Don't set is_recurring=FALSE for yearly subscriptions when cancelling
--          Token refills should continue until subscription_end_date is reached

-- Step 1: Update cancel_subscription_at_period_end to NOT set is_recurring=FALSE for yearly
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
  -- For YEARLY subscriptions: Keep is_recurring=TRUE so monthly token refills continue
  -- For MONTHLY subscriptions: Set is_recurring=FALSE to stop auto-renewal
  UPDATE user_subscriptions
  SET
    cancel_at_period_end = TRUE,
    cancellation_reason = p_reason,
    cancellation_requested_at = NOW(),
    -- Only set is_recurring=FALSE for monthly subscriptions
    -- Yearly subscriptions need is_recurring=TRUE to continue monthly token refills
    is_recurring = CASE
      WHEN billing_cycle = 'yearly' THEN TRUE
      ELSE FALSE
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active';

  RETURN QUERY SELECT TRUE, 'Subscription will be cancelled at the end of the billing period'::TEXT, v_subscription.period_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Update expire_cancelled_subscriptions to use subscription_end_date for yearly
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
  -- For YEARLY: Use subscription_end_date (full year)
  -- For MONTHLY: Use period_end_date (1 month)
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
      -- For yearly subscriptions: Check subscription_end_date
      (billing_cycle = 'yearly' AND subscription_end_date IS NOT NULL AND subscription_end_date <= NOW())
      OR
      -- For monthly subscriptions: Check period_end_date
      (billing_cycle = 'monthly' AND period_end_date <= NOW())
    );

  RAISE NOTICE 'Downgraded cancelled subscriptions to free tier';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Update reset_subscription_period to handle cancelled yearly subscriptions
CREATE OR REPLACE FUNCTION reset_subscription_period()
RETURNS void AS $$
BEGIN
  -- For MONTHLY subscriptions: Reset tokens monthly and extend period by 1 month
  --   - Only if is_recurring=TRUE (not cancelled or non-recurring payment method)
  -- For YEARLY subscriptions: Reset tokens monthly regardless of is_recurring
  --   - Continue until subscription_end_date is reached
  --   - Even if cancelled (user paid for full year)

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
    AND (
      -- For yearly subscriptions: Always reset if subscription hasn't ended
      (billing_cycle = 'yearly' AND (subscription_end_date IS NULL OR subscription_end_date > NOW()))
      OR
      -- For monthly subscriptions: Only reset if recurring (not cancelled/expired)
      (billing_cycle = 'monthly' AND is_recurring = TRUE)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Fix existing cancelled yearly subscriptions
-- Restore is_recurring=TRUE for yearly subscriptions that are cancelled but still within their year
UPDATE user_subscriptions
SET
  is_recurring = TRUE,
  updated_at = NOW()
WHERE
  billing_cycle = 'yearly'
  AND cancel_at_period_end = TRUE
  AND is_recurring = FALSE
  AND status = 'active'
  AND subscription_end_date IS NOT NULL
  AND subscription_end_date > NOW();

-- Step 5: Update comments
COMMENT ON FUNCTION cancel_subscription_at_period_end IS
  'Marks subscription for cancellation at end of billing period. For YEARLY subscriptions, keeps is_recurring=TRUE to allow monthly token refills until year ends. For MONTHLY subscriptions, sets is_recurring=FALSE to stop auto-renewal.';

COMMENT ON FUNCTION expire_cancelled_subscriptions IS
  'Processes subscriptions marked for cancellation. For YEARLY: Downgrades when subscription_end_date is reached. For MONTHLY: Downgrades when period_end_date is reached.';

COMMENT ON FUNCTION reset_subscription_period IS
  'Resets token usage monthly for all active subscriptions. YEARLY subscriptions get monthly resets regardless of is_recurring (even if cancelled). MONTHLY subscriptions only reset if is_recurring=TRUE (not cancelled).';

-- Verify the fixes
SELECT
  'Cancelled Yearly Subscriptions Status' as check_name,
  p.email,
  st.name as tier_name,
  us.billing_cycle,
  us.is_recurring,
  us.cancel_at_period_end,
  us.subscription_end_date,
  ROUND(EXTRACT(EPOCH FROM (us.subscription_end_date - NOW())) / 86400) as days_until_expires,
  CASE
    WHEN us.billing_cycle = 'yearly' AND us.cancel_at_period_end = TRUE AND us.is_recurring = TRUE THEN '✅ FIXED: Will get monthly tokens until year ends'
    WHEN us.billing_cycle = 'yearly' AND us.cancel_at_period_end = TRUE AND us.is_recurring = FALSE THEN '❌ BROKEN: Wont get monthly tokens'
    ELSE 'N/A'
  END as status
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.status = 'active' AND us.billing_cycle = 'yearly' AND us.cancel_at_period_end = TRUE
ORDER BY us.created_at DESC;
