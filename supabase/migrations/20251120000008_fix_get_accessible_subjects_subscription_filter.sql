-- Update get_accessible_subjects_for_user to filter by user subscription
-- This ensures users only see subjects they're subscribed to

DROP FUNCTION IF EXISTS get_accessible_subjects_for_user(UUID, UUID);

CREATE OR REPLACE FUNCTION get_accessible_subjects_for_user(p_user_id UUID, p_grade_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_selected_subject_ids UUID[];
  v_selected_grade_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Check if user is admin
  SELECT (role = 'admin') INTO v_is_admin
  FROM profiles
  WHERE profiles.id = p_user_id;

  -- Admin: Return all active subjects without subscription filtering
  IF v_is_admin THEN
    IF p_grade_id IS NULL THEN
      -- Return all subjects that are active in at least one grade
      RETURN QUERY
      SELECT DISTINCT s.id, s.name, s.description
      FROM subjects s
      INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id
      WHERE sga.is_active = TRUE
      ORDER BY s.name;
    ELSE
      -- Return subjects active for the specified grade
      RETURN QUERY
      SELECT s.id, s.name, s.description
      FROM subjects s
      INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id
      WHERE sga.grade_id = p_grade_id AND sga.is_active = TRUE
      ORDER BY s.name;
    END IF;
    RETURN;
  END IF;

  -- Student: Get their subscription details
  SELECT selected_subject_ids, selected_grade_id
  INTO v_selected_subject_ids, v_selected_grade_id
  FROM user_subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  LIMIT 1;

  -- If no subscription found, return empty result
  IF v_selected_subject_ids IS NULL THEN
    RETURN;
  END IF;

  -- Filter based on whether grade_id is specified
  IF p_grade_id IS NULL THEN
    -- Return subscribed subjects that are active in their subscription grade
    RETURN QUERY
    SELECT DISTINCT s.id, s.name, s.description
    FROM subjects s
    INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id
    WHERE s.id = ANY(v_selected_subject_ids)
      AND sga.grade_id = v_selected_grade_id
      AND sga.is_active = TRUE
    ORDER BY s.name;
  ELSE
    -- Return subscribed subjects for the specified grade
    -- Only if the specified grade matches their subscription grade
    IF p_grade_id = v_selected_grade_id THEN
      RETURN QUERY
      SELECT DISTINCT s.id, s.name, s.description
      FROM subjects s
      INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id
      WHERE s.id = ANY(v_selected_subject_ids)
        AND sga.grade_id = p_grade_id
        AND sga.is_active = TRUE
      ORDER BY s.name;
    END IF;
  END IF;
END;
$$;
