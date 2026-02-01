-- Migration: Implement Dollar-Based Billing System
-- Description: Adds dollar tracking alongside token tracking for accurate cost management
-- Date: 2026-02-01
--
-- Background tracking is in USD dollars, but users see token amounts
-- Conversion rate: 500,000 tokens = $1.00 USD
--
-- This ensures accurate billing regardless of which AI model users select,
-- while maintaining familiar token-based display in the UI.

-- =====================================================
-- 1. ADD DOLLAR TRACKING TO SUBSCRIPTION TIERS
-- =====================================================

ALTER TABLE subscription_tiers
ADD COLUMN IF NOT EXISTS dollar_limit_per_period DECIMAL(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tokens_per_dollar INTEGER DEFAULT 500000;

COMMENT ON COLUMN subscription_tiers.dollar_limit_per_period IS 'Monthly/yearly dollar limit for AI usage (NULL = unlimited). Background tracking value.';
COMMENT ON COLUMN subscription_tiers.tokens_per_dollar IS 'Conversion rate for display: how many tokens equal $1 USD. Default: 500,000 tokens = $1';

-- Update existing tiers with dollar equivalents based on token_limit
-- Using conversion: 500,000 tokens = $1.00
UPDATE subscription_tiers
SET dollar_limit_per_period = CASE
  WHEN token_limit IS NULL THEN NULL  -- Unlimited stays unlimited
  WHEN token_limit = 50000 THEN 0.10  -- Free tier: 50k tokens = $0.10
  WHEN token_limit = 500000 THEN 1.00 -- Student tier: 500k tokens = $1.00
  ELSE (token_limit::DECIMAL / 500000.0) -- Calculate for any other values
END
WHERE dollar_limit_per_period IS NULL;

-- =====================================================
-- 2. ADD DOLLAR TRACKING TO USER SUBSCRIPTIONS
-- =====================================================

ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS dollars_used_current_period DECIMAL(10, 6) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS dollar_limit_override DECIMAL(10, 2) DEFAULT NULL;

COMMENT ON COLUMN user_subscriptions.dollars_used_current_period IS 'Actual USD cost accumulated in current billing period. Primary tracking metric.';
COMMENT ON COLUMN user_subscriptions.dollar_limit_override IS 'Admin override for dollar limit (takes precedence over tier limit). NULL uses tier default.';

-- Initialize dollars_used for existing subscriptions based on tokens_used
-- Using the same conversion rate
UPDATE user_subscriptions
SET dollars_used_current_period = (tokens_used_current_period::DECIMAL / 500000.0)
WHERE dollars_used_current_period = 0.00;

-- =====================================================
-- 3. CREATE HELPER FUNCTIONS FOR DOLLAR/TOKEN CONVERSION
-- =====================================================

-- Function to convert dollars to tokens for display
CREATE OR REPLACE FUNCTION dollars_to_tokens(
  p_dollars DECIMAL(10, 6),
  p_tokens_per_dollar INTEGER DEFAULT 500000
) RETURNS BIGINT AS $$
BEGIN
  IF p_dollars IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN FLOOR(p_dollars * p_tokens_per_dollar);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION dollars_to_tokens IS 'Converts dollar amount to token count for UI display. Default: $1 = 500,000 tokens';

-- Function to convert tokens to dollars (inverse)
CREATE OR REPLACE FUNCTION tokens_to_dollars(
  p_tokens BIGINT,
  p_tokens_per_dollar INTEGER DEFAULT 500000
) RETURNS DECIMAL(10, 6) AS $$
BEGIN
  IF p_tokens IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN (p_tokens::DECIMAL / p_tokens_per_dollar);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION tokens_to_dollars IS 'Converts token count to dollar amount. Default: 500,000 tokens = $1';

-- =====================================================
-- 4. UPDATE SUBSCRIPTION ACCESS CHECK FOR DOLLAR-BASED BILLING
-- =====================================================

-- Drop all versions of the existing function to allow changing the return type
-- This handles both with and without default parameters
DROP FUNCTION IF EXISTS check_user_subscription_access(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS check_user_subscription_access(UUID) CASCADE;
DROP FUNCTION IF EXISTS check_user_subscription_access CASCADE;

CREATE OR REPLACE FUNCTION check_user_subscription_access(
  p_user_id UUID,
  p_feature TEXT DEFAULT 'chat'
)
RETURNS TABLE (
  has_access BOOLEAN,
  tier_name TEXT,
  reason TEXT,
  tokens_remaining BIGINT,
  dollars_remaining DECIMAL(10, 6),
  papers_remaining INTEGER
) AS $$
DECLARE
  v_subscription user_subscriptions%ROWTYPE;
  v_tier subscription_tiers%ROWTYPE;
  v_dollar_limit DECIMAL(10, 2);
  v_paper_limit INTEGER;
  v_tokens_remaining_value BIGINT;
  v_dollars_remaining_value DECIMAL(10, 6);
  v_papers_remaining_value INTEGER;
  v_tier_name TEXT;
BEGIN
  -- Get active subscription
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
    AND (period_end_date IS NULL OR period_end_date > NOW())
  ORDER BY created_at DESC
  LIMIT 1;

  -- No active subscription found
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'none'::TEXT,
      'No active subscription found'::TEXT,
      0::BIGINT,
      0.00::DECIMAL(10, 6),
      0;
    RETURN;
  END IF;

  -- Get tier details
  SELECT * INTO v_tier
  FROM subscription_tiers
  WHERE id = v_subscription.tier_id;

  v_tier_name := v_tier.name;

  -- Determine effective dollar limit (override takes precedence)
  v_dollar_limit := COALESCE(v_subscription.dollar_limit_override, v_tier.dollar_limit_per_period);
  v_paper_limit := COALESCE(v_tier.papers_limit);

  -- Calculate remaining dollars
  IF v_dollar_limit IS NULL THEN
    v_dollars_remaining_value := -1; -- Unlimited
    v_tokens_remaining_value := -1;
  ELSE
    v_dollars_remaining_value := v_dollar_limit - COALESCE(v_subscription.dollars_used_current_period, 0);
    -- Convert to tokens for display
    v_tokens_remaining_value := dollars_to_tokens(v_dollars_remaining_value, COALESCE(v_tier.tokens_per_dollar, 500000));
  END IF;

  -- Calculate remaining papers
  IF v_paper_limit IS NULL THEN
    v_papers_remaining_value := -1; -- Unlimited
  ELSE
    v_papers_remaining_value := v_paper_limit - COALESCE(v_subscription.papers_accessed_current_period, 0);
  END IF;

  -- Check access based on feature
  IF p_feature = 'chat' OR p_feature = 'ai_usage' THEN
    IF v_dollars_remaining_value = -1 OR v_dollars_remaining_value > 0 THEN
      RETURN QUERY SELECT
        TRUE,
        v_tier_name,
        'Access granted'::TEXT,
        v_tokens_remaining_value,
        v_dollars_remaining_value,
        v_papers_remaining_value;
    ELSE
      RETURN QUERY SELECT
        FALSE,
        v_tier_name,
        'Dollar limit exceeded for current period'::TEXT,
        v_tokens_remaining_value,
        v_dollars_remaining_value,
        v_papers_remaining_value;
    END IF;
  ELSIF p_feature = 'paper_access' THEN
    IF v_papers_remaining_value = -1 OR v_papers_remaining_value > 0 THEN
      RETURN QUERY SELECT
        TRUE,
        v_tier_name,
        'Access granted'::TEXT,
        v_tokens_remaining_value,
        v_dollars_remaining_value,
        v_papers_remaining_value;
    ELSE
      RETURN QUERY SELECT
        FALSE,
        v_tier_name,
        'Paper limit exceeded for current period'::TEXT,
        v_tokens_remaining_value,
        v_dollars_remaining_value,
        v_papers_remaining_value;
    END IF;
  ELSE
    -- Generic access check
    RETURN QUERY SELECT
      TRUE,
      v_tier_name,
      'Access granted'::TEXT,
      v_tokens_remaining_value,
      v_dollars_remaining_value,
      v_papers_remaining_value;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_user_subscription_access(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_subscription_access(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION check_user_subscription_access IS 'Checks user subscription access with dollar-based billing. Returns both token and dollar values for backward compatibility.';

-- =====================================================
-- 5. UPDATE SUBSCRIPTION PERIOD RESET FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION reset_subscription_period()
RETURNS void AS $$
BEGIN
  -- Reset token AND dollar counters for subscriptions that have expired
  UPDATE user_subscriptions
  SET
    tokens_used_current_period = 0,
    dollars_used_current_period = 0.00,  -- ADDED: Reset dollar usage
    papers_accessed_current_period = 0,
    accessed_paper_ids = ARRAY[]::UUID[],
    period_start_date = NOW(),
    period_end_date = CASE
      WHEN billing_cycle = 'monthly' THEN NOW() + INTERVAL '30 days'
      WHEN billing_cycle = 'yearly' THEN NOW() + INTERVAL '365 days'
      WHEN billing_cycle = 'daily' THEN NOW() + INTERVAL '1 day'
      ELSE period_end_date
    END
  WHERE status = 'active'
    AND period_end_date IS NOT NULL
    AND period_end_date < NOW();

  RAISE LOG 'Reset % subscription periods', (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'active' AND period_end_date < NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. UPDATE PAYMENT COMPLETION HANDLER
-- =====================================================

CREATE OR REPLACE FUNCTION handle_successful_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_tier subscription_tiers%ROWTYPE;
  v_period_end_date TIMESTAMPTZ;
BEGIN
  -- Only process completed payments
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Get tier details
  SELECT * INTO v_tier
  FROM subscription_tiers
  WHERE id = NEW.tier_id;

  -- Calculate period end date
  v_period_end_date := CASE
    WHEN NEW.billing_cycle = 'monthly' THEN NOW() + INTERVAL '30 days'
    WHEN NEW.billing_cycle = 'yearly' THEN NOW() + INTERVAL '365 days'
    WHEN NEW.billing_cycle = 'daily' THEN NOW() + INTERVAL '1 day'
    WHEN NEW.billing_cycle = 'lifetime' THEN NULL
    ELSE NOW() + INTERVAL '30 days'
  END;

  -- Create or update subscription
  INSERT INTO user_subscriptions (
    user_id,
    tier_id,
    status,
    billing_cycle,
    tokens_used_current_period,
    dollars_used_current_period,  -- ADDED: Initialize dollar usage
    period_start_date,
    period_end_date,
    papers_accessed_current_period,
    accessed_paper_ids,
    selected_grade_id,
    selected_subject_ids,
    payment_provider,
    payment_id,
    amount_paid,
    currency
  ) VALUES (
    NEW.user_id,
    NEW.tier_id,
    'active',
    NEW.billing_cycle,
    0,
    0.00,  -- ADDED: Start with zero dollar usage
    NOW(),
    v_period_end_date,
    0,
    ARRAY[]::UUID[],
    NEW.selected_grade_id,
    NEW.selected_subject_ids,
    (SELECT name FROM payment_methods WHERE id = NEW.payment_method_id),
    NEW.external_payment_id,
    NEW.amount,
    NEW.currency
  )
  ON CONFLICT (user_id, tier_id)
  WHERE status = 'active'
  DO UPDATE SET
    status = 'active',
    billing_cycle = NEW.billing_cycle,
    tokens_used_current_period = 0,
    dollars_used_current_period = 0.00,  -- ADDED: Reset dollar usage
    period_start_date = NOW(),
    period_end_date = v_period_end_date,
    papers_accessed_current_period = 0,
    accessed_paper_ids = ARRAY[]::UUID[],
    selected_grade_id = NEW.selected_grade_id,
    selected_subject_ids = NEW.selected_subject_ids,
    payment_provider = (SELECT name FROM payment_methods WHERE id = NEW.payment_method_id),
    payment_id = NEW.external_payment_id,
    amount_paid = NEW.amount,
    currency = NEW.currency,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION dollars_to_tokens(DECIMAL, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION dollars_to_tokens(DECIMAL, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION tokens_to_dollars(BIGINT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION tokens_to_dollars(BIGINT, INTEGER) TO service_role;

-- =====================================================
-- 8. ADD INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_dollars_used
ON user_subscriptions(dollars_used_current_period)
WHERE status = 'active';

COMMENT ON INDEX idx_user_subscriptions_dollars_used IS 'Optimizes queries checking dollar usage limits';
