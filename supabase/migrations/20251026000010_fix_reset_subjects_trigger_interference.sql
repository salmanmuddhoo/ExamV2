-- FIX: Reset subjects trigger was clearing grade/subject selections during purchase
-- The trigger was running BEFORE UPDATE and clearing values when tier changed
-- This prevented handle_successful_payment from setting grade/subjects during purchase

-- Original bug flow:
-- 1. handle_successful_payment sets tier_id + selected_grade_id + selected_subject_ids
-- 2. reset_subjects_on_tier_change runs (BEFORE UPDATE)
-- 3. Detects tier change, clears selected_grade_id and selected_subject_ids → NULL
-- 4. UPDATE completes with NULL values (data lost!)

CREATE OR REPLACE FUNCTION reset_subjects_on_tier_change()
RETURNS TRIGGER AS $$
DECLARE
  v_new_tier RECORD;
BEGIN
  -- Only proceed if tier is changing
  IF OLD.tier_id != NEW.tier_id THEN
    -- Get the new tier info
    SELECT name, can_select_subjects INTO v_new_tier
    FROM subscription_tiers
    WHERE id = NEW.tier_id;

    -- FIX: Only clear subjects if they're NOT being set in this UPDATE
    -- If grade/subjects are being provided (not NULL), keep them!
    -- This allows handle_successful_payment to set them during purchase
    IF NEW.selected_grade_id IS NULL AND
       (NEW.selected_subject_ids IS NULL OR array_length(NEW.selected_subject_ids, 1) IS NULL) THEN

      -- Original logic: clear subjects when tier changes
      -- (only runs if subjects are NOT being set in this update)
      IF v_new_tier.name = 'free' THEN
        -- Auto-track will handle it
        NEW.selected_subject_ids := NULL;
        NEW.selected_grade_id := NULL;
      ELSIF v_new_tier.can_select_subjects THEN
        -- Clear the auto-tracked subjects for paid tiers
        -- User will select during purchase or via profile setup
        NEW.selected_subject_ids := NULL;
        NEW.selected_grade_id := NULL;
      END IF;
    END IF;
    -- ELSE: Grade/subjects are being set in this UPDATE, don't touch them!
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_subjects_on_tier_change IS
'Clears subject selections when tier changes (upgrades/downgrades).
IMPORTANT: Only clears if selections are NOT being set in the same UPDATE.
This allows handle_successful_payment to set grade/subjects during purchase without interference.';
