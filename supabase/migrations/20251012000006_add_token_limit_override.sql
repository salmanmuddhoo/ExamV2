-- Add token_limit_override column to user_subscriptions
-- This allows individual subscriptions to have custom token limits (for carryover)
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS token_limit_override INTEGER;

-- Add comment
COMMENT ON COLUMN user_subscriptions.token_limit_override IS
  'Custom token limit for this subscription. If set, overrides the tier''s default token_limit. Used for token carryover when upgrading tiers.';
