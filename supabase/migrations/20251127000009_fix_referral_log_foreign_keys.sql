-- Fix foreign key constraints in referral_points_log to allow user deletion
-- Issue: When admin deletes a user, it fails because referral_points_log
-- has foreign keys without proper ON DELETE behavior

-- Drop existing foreign key constraints
ALTER TABLE referral_points_log
  DROP CONSTRAINT IF EXISTS referral_points_log_subscription_id_fkey,
  DROP CONSTRAINT IF EXISTS referral_points_log_user_id_fkey,
  DROP CONSTRAINT IF EXISTS referral_points_log_referrer_id_fkey;

-- Re-add foreign keys with ON DELETE SET NULL
-- We want to keep log entries for historical purposes, but set references to NULL when deleted
ALTER TABLE referral_points_log
  ADD CONSTRAINT referral_points_log_subscription_id_fkey
    FOREIGN KEY (subscription_id)
    REFERENCES user_subscriptions(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT referral_points_log_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT referral_points_log_referrer_id_fkey
    FOREIGN KEY (referrer_id)
    REFERENCES profiles(id)
    ON DELETE SET NULL;

COMMENT ON TABLE referral_points_log IS
'Logs all attempts to award referral points for debugging.
Uses ON DELETE SET NULL to preserve historical logs when users/subscriptions are deleted.';
