-- Migration: Add 'daily' to billing_cycle CHECK constraints
-- This migration updates all billing_cycle CHECK constraints to support daily billing
-- Created: 2025-12-09

-- ============================================================================
-- 1. Update payment_transactions billing_cycle constraint
-- ============================================================================
-- Drop the existing constraint
ALTER TABLE payment_transactions
DROP CONSTRAINT IF EXISTS payment_transactions_billing_cycle_check;

-- Add new constraint with 'daily' included
ALTER TABLE payment_transactions
ADD CONSTRAINT payment_transactions_billing_cycle_check
CHECK (billing_cycle IN ('daily', 'monthly', 'yearly'));

COMMENT ON CONSTRAINT payment_transactions_billing_cycle_check ON payment_transactions IS
  'Ensures billing_cycle is one of: daily, monthly, or yearly';

-- ============================================================================
-- 2. Update user_subscriptions billing_cycle constraint
-- ============================================================================
-- Drop the existing constraint
ALTER TABLE user_subscriptions
DROP CONSTRAINT IF EXISTS user_subscriptions_billing_cycle_check;

-- Add new constraint with 'daily' included (keeping 'lifetime' as well)
ALTER TABLE user_subscriptions
ADD CONSTRAINT user_subscriptions_billing_cycle_check
CHECK (billing_cycle IN ('daily', 'monthly', 'yearly', 'lifetime'));

COMMENT ON CONSTRAINT user_subscriptions_billing_cycle_check ON user_subscriptions IS
  'Ensures billing_cycle is one of: daily, monthly, yearly, or lifetime';

-- ============================================================================
-- 3. Update paypal_subscription_plans billing_cycle constraint
-- ============================================================================
-- Drop the existing constraint
ALTER TABLE paypal_subscription_plans
DROP CONSTRAINT IF EXISTS paypal_subscription_plans_billing_cycle_check;

-- Add new constraint with 'daily' included
ALTER TABLE paypal_subscription_plans
ADD CONSTRAINT paypal_subscription_plans_billing_cycle_check
CHECK (billing_cycle IN ('daily', 'monthly', 'yearly'));

COMMENT ON CONSTRAINT paypal_subscription_plans_billing_cycle_check ON paypal_subscription_plans IS
  'Ensures billing_cycle is one of: daily, monthly, or yearly';

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Run this to verify the constraints were updated correctly:
-- SELECT
--   conname AS constraint_name,
--   conrelid::regclass AS table_name,
--   pg_get_constraintdef(oid) AS constraint_definition
-- FROM pg_constraint
-- WHERE conname LIKE '%billing_cycle_check'
-- ORDER BY conrelid::regclass::text;
