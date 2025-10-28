-- Migration: Add Receipt Tracking to Payment Transactions
-- Description: Adds fields to track receipt email sending for payment confirmations
-- Author: Claude
-- Date: 2025-10-28

-- Add receipt tracking columns to payment_transactions
ALTER TABLE public.payment_transactions
ADD COLUMN IF NOT EXISTS receipt_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS receipt_email TEXT,
ADD COLUMN IF NOT EXISTS receipt_id TEXT;

-- Add index for querying unsent receipts
CREATE INDEX IF NOT EXISTS idx_payment_transactions_receipt_sent
ON public.payment_transactions(receipt_sent, status);

-- Add comment
COMMENT ON COLUMN public.payment_transactions.receipt_sent IS 'Whether a receipt email has been sent for this transaction';
COMMENT ON COLUMN public.payment_transactions.receipt_sent_at IS 'Timestamp when the receipt email was sent';
COMMENT ON COLUMN public.payment_transactions.receipt_email IS 'Email address where the receipt was sent';
COMMENT ON COLUMN public.payment_transactions.receipt_id IS 'Unique ID for the receipt (for tracking and resending)';

-- Create function to mark receipt as sent
CREATE OR REPLACE FUNCTION public.mark_receipt_sent(
    p_transaction_id UUID,
    p_email TEXT,
    p_receipt_id TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.payment_transactions
    SET
        receipt_sent = TRUE,
        receipt_sent_at = NOW(),
        receipt_email = p_email,
        receipt_id = p_receipt_id,
        updated_at = NOW()
    WHERE id = p_transaction_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.mark_receipt_sent IS 'Marks a payment transaction as having a receipt sent';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.mark_receipt_sent TO authenticated;
