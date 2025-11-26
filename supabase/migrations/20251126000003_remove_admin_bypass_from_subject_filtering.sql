-- Remove admin bypass from get_accessible_subjects_for_user
-- Admins should follow the same subscription restrictions as regular users
-- Admin privileges are controlled by subscription tier, not role

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
  v_subscription RECORD;
BEGIN
  -- Get user's subscription with tier information
  -- No special handling for admins - they follow the same rules
  SELECT
    us.selected_subject_ids,
    us.selected_grade_id,
    st.name as tier_name
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
  LIMIT 1;

  -- If no subscription found, return empty result
  IF v_subscription IS NULL THEN
    RETURN;
  END IF;

  -- Pro and Free tiers: Return all active subjects (no filtering by subscription)
  IF v_subscription.tier_name IN ('pro', 'free') THEN
    IF p_grade_id IS NULL THEN
      RETURN QUERY
      SELECT DISTINCT s.id, s.name, s.description
      FROM subjects s
      INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id
      WHERE sga.is_active = TRUE
      ORDER BY s.name;
    ELSE
      RETURN QUERY
      SELECT s.id, s.name, s.description
      FROM subjects s
      INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id
      WHERE sga.grade_id = p_grade_id AND sga.is_active = TRUE
      ORDER BY s.name;
    END IF;
    RETURN;
  END IF;

  -- Student/Student Lite tiers: Filter by selected subjects
  IF v_subscription.selected_subject_ids IS NULL THEN
    RETURN;
  END IF;

  IF p_grade_id IS NULL THEN
    -- Return subscribed subjects that are active in their subscription grade
    RETURN QUERY
    SELECT DISTINCT s.id, s.name, s.description
    FROM subjects s
    INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id
    WHERE s.id = ANY(v_subscription.selected_subject_ids)
      AND sga.grade_id = v_subscription.selected_grade_id
      AND sga.is_active = TRUE
    ORDER BY s.name;
  ELSE
    -- Return subscribed subjects for the specified grade
    -- Only if the specified grade matches their subscription grade
    IF p_grade_id = v_subscription.selected_grade_id THEN
      RETURN QUERY
      SELECT DISTINCT s.id, s.name, s.description
      FROM subjects s
      INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id
      WHERE s.id = ANY(v_subscription.selected_subject_ids)
        AND sga.grade_id = p_grade_id
        AND sga.is_active = TRUE
      ORDER BY s.name;
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_accessible_subjects_for_user IS
'Returns subjects accessible to a user based on their subscription tier.
Admins are treated the same as regular users - they follow subscription restrictions.
Admin privileges are controlled by subscription tier (e.g., assign them Pro tier), not by role.

Tier behavior:
- Pro tier: All active subjects (unlimited access)
- Free tier: All active subjects (unlimited access, usage restricted by token limits)
- Student/Student Lite: Only subscribed subjects in their selected grade';
