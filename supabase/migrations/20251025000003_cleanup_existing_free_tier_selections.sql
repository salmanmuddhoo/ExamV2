-- One-time cleanup: Reset selections for existing free tier users
-- This handles cases where users were already downgraded before the migration was applied

-- Reset grade and subject selections for all active free tier subscriptions
UPDATE user_subscriptions
SET
  selected_grade_id = NULL,
  selected_subject_ids = NULL,
  updated_at = NOW()
WHERE
  status = 'active'
  AND tier_id IN (
    SELECT id FROM subscription_tiers WHERE name = 'free' AND is_active = TRUE
  )
  AND (selected_grade_id IS NOT NULL OR selected_subject_ids IS NOT NULL);

-- Log the result
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Cleaned up % existing free tier subscriptions with selections', v_updated_count;
END $$;
