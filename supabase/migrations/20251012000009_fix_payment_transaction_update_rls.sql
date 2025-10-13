-- Fix RLS policy to allow users to update their own payment transactions
-- This allows Stripe/PayPal payment components to mark transactions as 'completed'

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Admins can update payment transactions" ON payment_transactions;

-- Create new policy that allows both admins AND users updating their own transactions
CREATE POLICY "Users can update their own payment transactions"
  ON payment_transactions FOR UPDATE
  TO authenticated
  USING (
    -- Allow if user is admin OR if user is updating their own transaction
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'admin'
        OR payment_transactions.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    -- Same check for WITH CHECK
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'admin'
        OR payment_transactions.user_id = auth.uid()
      )
    )
  );

-- Comment
COMMENT ON POLICY "Users can update their own payment transactions" ON payment_transactions IS
  'Allows users to update their own payment transactions (e.g., when Stripe/PayPal confirms payment) and allows admins to update all transactions';
