-- Migration: Add PayPal Subscriptions Support
-- This migration adds support for both one-time and recurring PayPal payments
-- Created: 2025-11-17

-- 1. Create table for PayPal subscription plans
CREATE TABLE IF NOT EXISTS paypal_subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier_id UUID REFERENCES subscription_tiers(id) NOT NULL,
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  paypal_plan_id TEXT NOT NULL UNIQUE,
  price DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tier_id, billing_cycle)
);

-- 2. Add columns to payment_transactions for subscription tracking
ALTER TABLE payment_transactions
ADD COLUMN IF NOT EXISTS paypal_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS paypal_plan_id TEXT,
ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'one_time' CHECK (payment_type IN ('one_time', 'recurring'));

-- 3. Create index for faster subscription lookups
CREATE INDEX IF NOT EXISTS idx_payment_transactions_subscription
ON payment_transactions(paypal_subscription_id) WHERE paypal_subscription_id IS NOT NULL;

-- 4. Add index on payment_type for analytics
CREATE INDEX IF NOT EXISTS idx_payment_transactions_type
ON payment_transactions(payment_type);

-- 5. Create RLS policies for paypal_subscription_plans
ALTER TABLE paypal_subscription_plans ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read active plans (needed for frontend)
CREATE POLICY "Allow public read of active plans"
ON paypal_subscription_plans
FOR SELECT
USING (is_active = true);

-- Only admins can insert/update/delete plans
CREATE POLICY "Allow admin insert plans"
ON paypal_subscription_plans
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Allow admin update plans"
ON paypal_subscription_plans
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Allow admin delete plans"
ON paypal_subscription_plans
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- 6. Create function to get PayPal plan for a tier/cycle
CREATE OR REPLACE FUNCTION get_paypal_plan(
  p_tier_id UUID,
  p_billing_cycle TEXT
)
RETURNS TABLE (
  plan_id UUID,
  paypal_plan_id TEXT,
  price DECIMAL(10, 2),
  currency TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    psp.id,
    psp.paypal_plan_id,
    psp.price,
    psp.currency
  FROM paypal_subscription_plans psp
  WHERE psp.tier_id = p_tier_id
    AND psp.billing_cycle = p_billing_cycle
    AND psp.is_active = true;
END;
$$;

-- 7. Create function to cancel PayPal subscription
CREATE OR REPLACE FUNCTION cancel_paypal_subscription(
  p_user_id UUID,
  p_subscription_id TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id UUID;
  v_result JSON;
BEGIN
  -- Find the transaction
  SELECT id INTO v_transaction_id
  FROM payment_transactions
  WHERE user_id = p_user_id
    AND paypal_subscription_id = p_subscription_id
    AND payment_type = 'recurring'
    AND status IN ('completed', 'active');

  IF v_transaction_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Subscription not found'
    );
  END IF;

  -- Update transaction to mark for cancellation
  UPDATE payment_transactions
  SET
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'cancellation_requested', true,
      'cancellation_requested_at', NOW()
    )
  WHERE id = v_transaction_id;

  -- Note: Actual PayPal API cancellation happens in your backend/webhook
  -- This just marks it in the database

  RETURN json_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'message', 'Cancellation request recorded. You will retain access until the end of your billing period.'
  );
END;
$$;

-- 8. Add comment for documentation
COMMENT ON TABLE paypal_subscription_plans IS 'Stores PayPal subscription plan mappings for recurring payments';
COMMENT ON COLUMN payment_transactions.payment_type IS 'Type of payment: one_time for manual renewal, recurring for automatic subscription';
COMMENT ON COLUMN payment_transactions.paypal_subscription_id IS 'PayPal subscription ID for recurring payments';
COMMENT ON COLUMN payment_transactions.paypal_plan_id IS 'PayPal plan ID used to create the subscription';

-- 9. Grant necessary permissions
GRANT SELECT ON paypal_subscription_plans TO authenticated;
GRANT SELECT ON paypal_subscription_plans TO anon;
