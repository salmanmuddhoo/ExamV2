-- Fix yearly subscriptions to reset tokens monthly while maintaining yearly billing period
-- Yearly subscribers get monthly token allocations but their subscription lasts a full year

-- Add subscription_end_date to track when the yearly subscription actually ends
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;

-- Update existing yearly subscriptions to set subscription_end_date
UPDATE user_subscriptions
SET subscription_end_date = period_end_date
WHERE billing_cycle = 'yearly'
  AND subscription_end_date IS NULL
  AND status = 'active';

-- Comment
COMMENT ON COLUMN user_subscriptions.subscription_end_date IS
  'For yearly subscriptions, this tracks when the yearly subscription actually expires. period_end_date is used for monthly token resets.';

-- Update the reset_subscription_period function to handle yearly subscriptions correctly
CREATE OR REPLACE FUNCTION reset_subscription_period()
RETURNS void AS $$
BEGIN
  -- For MONTHLY subscriptions: Reset tokens monthly and extend period by 1 month
  -- For YEARLY subscriptions: Reset tokens monthly but check subscription hasn't expired
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
      -- Yearly: extend by 1 month for monthly token resets, but check subscription_end_date
      WHEN billing_cycle = 'yearly' THEN NOW() + INTERVAL '1 month'
      ELSE period_end_date
    END,
    updated_at = NOW()
  WHERE
    status = 'active'
    AND period_end_date < NOW()
    AND is_recurring = TRUE -- Only auto-renew recurring subscriptions
    AND (
      -- For monthly subscriptions, just check period_end_date
      billing_cycle = 'monthly'
      OR
      -- For yearly subscriptions, also check that subscription hasn't ended
      (billing_cycle = 'yearly' AND (subscription_end_date IS NULL OR subscription_end_date > NOW()))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update function to expire yearly subscriptions when subscription_end_date is reached
CREATE OR REPLACE FUNCTION expire_yearly_subscriptions()
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

  -- Expire yearly subscriptions that have reached their subscription_end_date
  WITH expired_subs AS (
    UPDATE user_subscriptions
    SET
      status = 'expired',
      updated_at = NOW()
    WHERE
      status = 'active'
      AND billing_cycle = 'yearly'
      AND subscription_end_date IS NOT NULL
      AND subscription_end_date < NOW()
    RETURNING user_id
  )
  -- Downgrade expired users to free tier
  INSERT INTO user_subscriptions (
    user_id,
    tier_id,
    status,
    billing_cycle,
    is_recurring,
    period_start_date,
    period_end_date,
    tokens_used_current_period,
    papers_accessed_current_period
  )
  SELECT
    user_id,
    v_free_tier_id,
    'active',
    'monthly',
    FALSE,
    NOW(),
    NOW() + INTERVAL '30 days',
    0,
    0
  FROM expired_subs
  ON CONFLICT (user_id) DO UPDATE SET
    tier_id = v_free_tier_id,
    status = 'active',
    billing_cycle = 'monthly',
    is_recurring = FALSE,
    period_start_date = NOW(),
    period_end_date = NOW() + INTERVAL '30 days',
    tokens_used_current_period = 0,
    papers_accessed_current_period = 0,
    accessed_paper_ids = ARRAY[]::uuid[],
    updated_at = NOW();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  RAISE NOTICE 'Expired % yearly subscriptions', v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the payment handler to set subscription_end_date for yearly subscriptions
CREATE OR REPLACE FUNCTION handle_successful_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_old_limit INTEGER;
  v_old_used INTEGER;
  v_old_remaining INTEGER;
  v_new_limit INTEGER;
  v_new_token_limit_override INTEGER;
  v_subscription_end_date TIMESTAMPTZ;
BEGIN
  -- Only proceed if status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

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
      period_start_date,
      period_end_date,
      subscription_end_date,
      selected_grade_id,
      selected_subject_ids,
      token_limit_override,
      tokens_used_current_period,
      papers_accessed_current_period,
      payment_provider
    )
    VALUES (
      NEW.user_id,
      NEW.tier_id,
      'active',
      NEW.billing_cycle,
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
      (SELECT name FROM payment_methods WHERE id = NEW.payment_method_id)
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      tier_id = EXCLUDED.tier_id,
      status = 'active',
      billing_cycle = EXCLUDED.billing_cycle,
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
      updated_at = NOW();

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION reset_subscription_period IS
  'Resets token usage monthly for all active recurring subscriptions. Yearly subscriptions get monthly token resets but maintain their year-long subscription period via subscription_end_date.';

COMMENT ON FUNCTION expire_yearly_subscriptions IS
  'Expires yearly subscriptions when they reach their subscription_end_date (1 year after purchase) and downgrades to free tier.';

COMMENT ON FUNCTION handle_successful_payment IS
  'Handles subscription activation after successful payment. Implements token carryover and sets subscription_end_date for yearly subscriptions to track when they actually expire (while resetting tokens monthly).';
