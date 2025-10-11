-- Add unique constraint on user_id in user_subscriptions table
-- This ensures one user can only have one active subscription at a time
-- Required for the payment trigger's ON CONFLICT clause to work

-- First, check if there are any duplicate user_ids (there shouldn't be)
-- If this fails, you'll need to clean up duplicates first

-- Add the unique constraint
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_user_id_key UNIQUE (user_id);

-- Create index for better performance on user lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
