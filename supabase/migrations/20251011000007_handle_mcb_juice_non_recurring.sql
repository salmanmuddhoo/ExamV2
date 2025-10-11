-- Handle MCB Juice as non-recurring payment method
-- MCB Juice requires manual payment each period, so subscription should not auto-renew

-- Step 1: Add payment_method_id to user_subscriptions for tracking
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES payment_methods(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_payment_method
  ON user_subscriptions(payment_method_id);

-- Step 2: Update the payment trigger to track payment method and set is_recurring properly
CREATE OR REPLACE FUNCTION handle_successful_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_method RECORD;
  v_is_recurring BOOLEAN;
BEGIN
  -- Only proceed if status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get payment method details to check if it requires manual approval (MCB Juice)
    SELECT * INTO v_payment_method
    FROM payment_methods
    WHERE id = NEW.payment_method_id;

    -- If payment method requires manual approval (MCB Juice), set is_recurring to FALSE
    -- Otherwise, set to TRUE for auto-renewing methods (Stripe, PayPal)
    IF v_payment_method.requires_manual_approval THEN
      v_is_recurring := FALSE;
    ELSE
      v_is_recurring := TRUE;
    END IF;

    -- Update or create user subscription
    INSERT INTO user_subscriptions (
      user_id,
      tier_id,
      status,
      billing_cycle,
      is_recurring,
      payment_method_id,
      payment_provider,
      period_start_date,
      period_end_date,
      selected_grade_id,
      selected_subject_ids
    )
    VALUES (
      NEW.user_id,
      NEW.tier_id,
      'active',
      NEW.billing_cycle,
      v_is_recurring, -- Set based on payment method
      NEW.payment_method_id, -- Track which payment method was used
      v_payment_method.name, -- Store payment provider name
      NOW(),
      CASE
        WHEN NEW.billing_cycle = 'monthly' THEN NOW() + INTERVAL '1 month'
        ELSE NOW() + INTERVAL '1 year'
      END,
      NEW.selected_grade_id,
      NEW.selected_subject_ids
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      tier_id = EXCLUDED.tier_id,
      status = 'active',
      billing_cycle = EXCLUDED.billing_cycle,
      is_recurring = EXCLUDED.is_recurring, -- Update recurring status
      payment_method_id = EXCLUDED.payment_method_id, -- Update payment method
      payment_provider = EXCLUDED.payment_provider, -- Update provider
      period_start_date = EXCLUDED.period_start_date,
      period_end_date = EXCLUDED.period_end_date,
      selected_grade_id = EXCLUDED.selected_grade_id,
      selected_subject_ids = EXCLUDED.selected_subject_ids,
      tokens_used_current_period = 0,
      papers_accessed_current_period = 0,
      updated_at = NOW();

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Update existing reset_subscription_period function to only reset recurring subscriptions
CREATE OR REPLACE FUNCTION reset_subscription_period()
RETURNS void AS $$
BEGIN
  -- Only reset recurring subscriptions (Stripe, PayPal)
  -- MCB Juice subscriptions (is_recurring = FALSE) should expire instead
  UPDATE user_subscriptions
  SET
    tokens_used_current_period = 0,
    papers_accessed_current_period = 0,
    accessed_paper_ids = '{}',
    period_start_date = NOW(),
    period_end_date = CASE
      WHEN billing_cycle = 'monthly' THEN NOW() + INTERVAL '30 days'
      WHEN billing_cycle = 'yearly' THEN NOW() + INTERVAL '365 days'
      ELSE period_end_date
    END,
    updated_at = NOW()
  WHERE
    status = 'active'
    AND period_end_date < NOW()
    AND is_recurring = TRUE; -- Only auto-renew recurring subscriptions
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create function to expire non-recurring subscriptions that have passed their end date
CREATE OR REPLACE FUNCTION expire_non_recurring_subscriptions()
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

  -- Expire non-recurring subscriptions that have passed their end date
  -- and downgrade them to free tier
  WITH expired_subs AS (
    UPDATE user_subscriptions
    SET
      status = 'expired',
      updated_at = NOW()
    WHERE
      status = 'active'
      AND is_recurring = FALSE
      AND period_end_date < NOW()
    RETURNING user_id, tier_id, billing_cycle
  )
  SELECT COUNT(*) INTO v_expired_count FROM expired_subs;

  -- Create free tier subscriptions for users whose subscriptions expired
  -- Only if they don't already have an active subscription
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
    WHERE status = 'expired'
      AND user_id NOT IN (
        SELECT user_id
        FROM user_subscriptions
        WHERE status = 'active'
      )
  ) es
  WHERE v_free_tier_id IS NOT NULL
  ON CONFLICT (user_id) DO NOTHING;

  RAISE NOTICE 'Expired % non-recurring subscriptions', v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create function to check subscription status and send notifications (placeholder)
-- This can be called by a cron job to notify users before expiration
CREATE OR REPLACE FUNCTION check_expiring_subscriptions(days_before INTEGER DEFAULT 7)
RETURNS TABLE (
  user_id UUID,
  user_email TEXT,
  tier_name TEXT,
  period_end_date TIMESTAMPTZ,
  days_remaining INTEGER,
  is_recurring BOOLEAN,
  payment_method TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    us.user_id,
    p.email,
    st.display_name AS tier_name,
    us.period_end_date,
    EXTRACT(DAY FROM us.period_end_date - NOW())::INTEGER AS days_remaining,
    us.is_recurring,
    pm.display_name AS payment_method
  FROM user_subscriptions us
  JOIN profiles p ON p.id = us.user_id
  JOIN subscription_tiers st ON st.id = us.tier_id
  LEFT JOIN payment_methods pm ON pm.id = us.payment_method_id
  WHERE
    us.status = 'active'
    AND us.period_end_date IS NOT NULL
    AND us.period_end_date > NOW()
    AND us.period_end_date <= NOW() + (days_before || ' days')::INTERVAL
    AND us.is_recurring = FALSE -- Only notify for non-recurring (manual payment) subscriptions
  ORDER BY us.period_end_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Add comment to explain the difference between recurring and non-recurring
COMMENT ON COLUMN user_subscriptions.is_recurring IS
  'TRUE for auto-renewing subscriptions (Stripe, PayPal). FALSE for manual payment methods (MCB Juice) that require user to make payment each period.';

COMMENT ON COLUMN user_subscriptions.payment_method_id IS
  'Tracks which payment method was used. Used to determine if subscription should auto-renew or require manual renewal.';

-- Step 7: Update payment_methods table comment
COMMENT ON COLUMN payment_methods.requires_manual_approval IS
  'TRUE for payment methods that require admin approval (MCB Juice). These subscriptions will NOT auto-renew and will expire at period_end_date if not renewed.';
