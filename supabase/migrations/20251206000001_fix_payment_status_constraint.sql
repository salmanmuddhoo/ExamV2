-- Fix payment_transactions status check constraint
-- Add missing status values: 'suspended' and 'expired'
-- These are used by PayPal webhook handlers for subscription management

-- Drop the existing constraint
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_status_check;

-- Add updated constraint with all possible status values
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN (
    'pending',      -- Initial state for pending payments
    'approved',     -- Admin approved (MCB Juice)
    'completed',    -- Payment successfully processed
    'failed',       -- Payment failed or declined
    'cancelled',    -- Payment cancelled by user or system
    'refunded',     -- Payment refunded
    'suspended',    -- Subscription suspended (PayPal)
    'expired'       -- Subscription expired (PayPal)
  ));

COMMENT ON CONSTRAINT payment_transactions_status_check ON payment_transactions IS
  'Allowed payment transaction statuses:
  - pending: Initial state, awaiting approval or processing
  - approved: Admin approved (manual payment methods)
  - completed: Payment successfully processed and subscription activated
  - failed: Payment declined or failed
  - cancelled: User or system cancelled the payment
  - refunded: Payment was refunded to customer
  - suspended: PayPal subscription suspended (usually payment failure)
  - expired: PayPal subscription expired';
