-- Add foreign key constraint to profiles table for better PostgREST joins
-- Note: profiles.id and auth.users.id are the same, so this is safe

-- First, ensure all user_ids in payment_transactions exist in profiles
-- (they should, but this is a safety check)
-- If there are orphaned records, this will fail and you'll need to clean them up

-- Add the foreign key constraint
-- We use the column name to create a named constraint that PostgREST can use
ALTER TABLE payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_user_id_fkey;

ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES profiles(id)
  ON DELETE CASCADE;

-- Also ensure the approved_by field can reference profiles
ALTER TABLE payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_approved_by_fkey;

ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_approved_by_fkey
  FOREIGN KEY (approved_by)
  REFERENCES profiles(id)
  ON DELETE SET NULL;
