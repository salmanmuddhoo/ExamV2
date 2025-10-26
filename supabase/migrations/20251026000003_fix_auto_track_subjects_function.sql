-- Drop and recreate the auto-track subjects functions to fix SQL error
-- This fixes the ARRAY_AGG DISTINCT ORDER BY error

-- Drop existing triggers first
DROP TRIGGER IF EXISTS trigger_auto_update_free_tier_subjects ON conversations;
DROP TRIGGER IF EXISTS trigger_reset_subjects_on_tier_change ON user_subscriptions;

-- Drop existing functions
DROP FUNCTION IF EXISTS auto_update_free_tier_subjects();
DROP FUNCTION IF EXISTS reset_subjects_on_tier_change();
DROP FUNCTION IF EXISTS get_recent_used_subjects(UUID, INTEGER);

-- Recreate the get_recent_used_subjects function with the fix
CREATE OR REPLACE FUNCTION get_recent_used_subjects(p_user_id UUID, p_limit INTEGER DEFAULT 2)
RETURNS UUID[] AS $$
DECLARE
  v_subject_ids UUID[];
BEGIN
  -- Get the most recent distinct subjects from conversations
  -- The subquery already ensures uniqueness via GROUP BY and orders by most recent
  -- So we just need ARRAY_AGG without DISTINCT or ORDER BY
  SELECT ARRAY_AGG(subject_id)
  INTO v_subject_ids
  FROM (
    SELECT
      ep.subject_id,
      MAX(c.updated_at) as max_updated
    FROM conversations c
    JOIN exam_papers ep ON c.exam_paper_id = ep.id
    WHERE c.user_id = p_user_id
    GROUP BY ep.subject_id
    ORDER BY max_updated DESC
    LIMIT p_limit
  ) recent_subjects;

  RETURN COALESCE(v_subject_ids, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_recent_used_subjects IS 'Returns the N most recently used subjects by a user based on conversation history';

-- Recreate the auto-update function
CREATE OR REPLACE FUNCTION auto_update_free_tier_subjects()
RETURNS TRIGGER AS $$
DECLARE
  v_subscription RECORD;
  v_recent_subjects UUID[];
BEGIN
  -- Get user's subscription
  SELECT us.*, st.name as tier_name
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = NEW.user_id AND us.status = 'active'
  LIMIT 1;

  -- Only proceed if user has free tier
  IF v_subscription IS NULL OR v_subscription.tier_name != 'free' THEN
    RETURN NEW;
  END IF;

  -- Get the 2 most recently used subjects
  v_recent_subjects := get_recent_used_subjects(NEW.user_id, 2);

  -- Update user_subscriptions with the recent subjects
  UPDATE user_subscriptions
  SET selected_subject_ids = v_recent_subjects
  WHERE user_id = NEW.user_id AND status = 'active';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION auto_update_free_tier_subjects IS 'Automatically tracks the 2 most recent subjects for free tier users when they create/update conversations';

-- Recreate the tier change function
CREATE OR REPLACE FUNCTION reset_subjects_on_tier_change()
RETURNS TRIGGER AS $$
DECLARE
  v_old_tier_name TEXT;
  v_new_tier_name TEXT;
BEGIN
  -- Get old tier name
  SELECT name INTO v_old_tier_name
  FROM subscription_tiers
  WHERE id = OLD.tier_id;

  -- Get new tier name
  SELECT name INTO v_new_tier_name
  FROM subscription_tiers
  WHERE id = NEW.tier_id;

  -- If upgrading FROM free tier TO paid tier, reset selected_subject_ids
  IF v_old_tier_name = 'free' AND v_new_tier_name IN ('student', 'student_lite', 'pro') THEN
    NEW.selected_subject_ids := NULL;
    NEW.selected_grade_id := NULL;
  END IF;

  -- If downgrading TO free tier FROM paid tier, reset selected_subject_ids
  -- They will be auto-populated by the trigger when they use the chat assistant
  IF v_new_tier_name = 'free' AND v_old_tier_name IN ('student', 'student_lite', 'pro') THEN
    NEW.selected_subject_ids := NULL;
    NEW.selected_grade_id := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION reset_subjects_on_tier_change IS 'Resets selected subjects when upgrading from free to paid or downgrading back to free';

-- Recreate triggers
CREATE TRIGGER trigger_auto_update_free_tier_subjects
  AFTER INSERT OR UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_free_tier_subjects();

CREATE TRIGGER trigger_reset_subjects_on_tier_change
  BEFORE UPDATE OF tier_id ON user_subscriptions
  FOR EACH ROW
  WHEN (OLD.tier_id IS DISTINCT FROM NEW.tier_id)
  EXECUTE FUNCTION reset_subjects_on_tier_change();

-- Initial update for existing free tier users with conversations
DO $$
DECLARE
  v_user RECORD;
  v_recent_subjects UUID[];
BEGIN
  -- Loop through all free tier users
  FOR v_user IN
    SELECT us.user_id
    FROM user_subscriptions us
    JOIN subscription_tiers st ON us.tier_id = st.id
    WHERE st.name = 'free' AND us.status = 'active'
  LOOP
    -- Get their 2 most recent subjects
    v_recent_subjects := get_recent_used_subjects(v_user.user_id, 2);

    -- Update their subscription if they have any subjects
    IF array_length(v_recent_subjects, 1) > 0 THEN
      UPDATE user_subscriptions
      SET selected_subject_ids = v_recent_subjects
      WHERE user_id = v_user.user_id AND status = 'active';
    END IF;
  END LOOP;
END $$;
