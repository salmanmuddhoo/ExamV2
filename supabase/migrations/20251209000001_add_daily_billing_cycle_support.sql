-- Migration: Add Daily Billing Cycle Support for PayPal Subscriptions
-- This migration extends paypal_subscription_plans to support daily billing cycles
-- Created: 2025-12-09

-- Drop the existing CHECK constraint on billing_cycle
ALTER TABLE paypal_subscription_plans
DROP CONSTRAINT IF EXISTS paypal_subscription_plans_billing_cycle_check;

-- Add updated CHECK constraint with 'daily' support
ALTER TABLE paypal_subscription_plans
ADD CONSTRAINT paypal_subscription_plans_billing_cycle_check
CHECK (billing_cycle IN ('daily', 'monthly', 'yearly'));

-- Update the user_subscriptions billing_cycle constraint as well for consistency
-- (This allows daily billing cycles across the entire system)
ALTER TABLE user_subscriptions
DROP CONSTRAINT IF EXISTS user_subscriptions_billing_cycle_check;

ALTER TABLE user_subscriptions
ADD CONSTRAINT user_subscriptions_billing_cycle_check
CHECK (billing_cycle IN ('daily', 'monthly', 'yearly', 'lifetime'));

-- Add comment for documentation
COMMENT ON CONSTRAINT paypal_subscription_plans_billing_cycle_check
ON paypal_subscription_plans IS 'Allows daily, monthly, and yearly billing cycles for PayPal subscriptions';

COMMENT ON CONSTRAINT user_subscriptions_billing_cycle_check
ON user_subscriptions IS 'Allows daily, monthly, yearly, and lifetime billing cycles for all subscription types';
