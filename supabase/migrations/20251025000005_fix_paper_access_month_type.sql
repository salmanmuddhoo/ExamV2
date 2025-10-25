-- Fix type mismatch in get_user_paper_access_status function
-- The month column is INTEGER in exam_papers table, but function declared it as TEXT

-- Drop the existing function first (required when changing return type)
DROP FUNCTION IF EXISTS get_user_paper_access_status(UUID);

-- Create the function with correct month type (INTEGER instead of TEXT)
CREATE OR REPLACE FUNCTION get_user_paper_access_status(p_user_id UUID)
RETURNS TABLE (
  paper_id UUID,
  paper_title TEXT,
  subject_id UUID,
  grade_level_id UUID,
  grade_name TEXT,
  subject_name TEXT,
  year INTEGER,
  month INTEGER,  -- Fixed: Changed from TEXT to INTEGER
  is_accessible BOOLEAN,
  is_recently_accessed BOOLEAN,
  last_accessed_at TIMESTAMPTZ,
  access_status TEXT  -- 'accessible', 'locked', 'recently_accessed'
) AS $$
DECLARE
  v_subscription RECORD;
  v_recent_papers UUID[];
  v_total_accessed INTEGER;
BEGIN
  -- Get user's active subscription
  SELECT us.*, st.name as tier_name, st.papers_limit
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  LIMIT 1;

  -- If no subscription, return empty
  IF v_subscription IS NULL THEN
    RETURN;
  END IF;

  -- For Pro tier: All papers are accessible
  IF v_subscription.tier_name = 'pro' THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      ep.subject_id,
      ep.grade_level_id,
      gl.name,
      s.name,
      ep.year,
      ep.month,  -- Returns INTEGER
      TRUE as is_accessible,
      FALSE as is_recently_accessed,
      NULL::TIMESTAMPTZ as last_accessed_at,
      'accessible'::TEXT as access_status
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    ORDER BY gl.display_order, s.name, ep.year DESC, ep.month;
    RETURN;
  END IF;

  -- For Free tier: Complex access logic
  IF v_subscription.tier_name = 'free' THEN
    -- Get count of unique papers accessed
    SELECT COUNT(DISTINCT exam_paper_id)
    INTO v_total_accessed
    FROM conversations
    WHERE user_id = p_user_id;

    -- Get recent papers
    v_recent_papers := get_recent_accessed_papers(p_user_id, COALESCE(v_subscription.papers_limit, 2));

    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      ep.subject_id,
      ep.grade_level_id,
      gl.name,
      s.name,
      ep.year,
      ep.month,  -- Returns INTEGER
      CASE
        -- If accessed less than limit, all papers accessible
        WHEN v_total_accessed < COALESCE(v_subscription.papers_limit, 2) THEN TRUE
        -- Otherwise only recent papers accessible
        WHEN ep.id = ANY(v_recent_papers) THEN TRUE
        ELSE FALSE
      END as is_accessible,
      ep.id = ANY(v_recent_papers) as is_recently_accessed,
      c.last_accessed,
      CASE
        WHEN v_total_accessed < COALESCE(v_subscription.papers_limit, 2) THEN 'accessible'::TEXT
        WHEN ep.id = ANY(v_recent_papers) THEN 'recently_accessed'::TEXT
        ELSE 'locked'::TEXT
      END as access_status
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    LEFT JOIN (
      SELECT exam_paper_id, MAX(updated_at) as last_accessed
      FROM conversations
      WHERE user_id = p_user_id
      GROUP BY exam_paper_id
    ) c ON ep.id = c.exam_paper_id
    ORDER BY
      CASE WHEN ep.id = ANY(v_recent_papers) THEN 0 ELSE 1 END,
      gl.display_order,
      s.name,
      ep.year DESC,
      ep.month;
    RETURN;
  END IF;

  -- For Student and Student Lite tiers
  IF v_subscription.tier_name IN ('student', 'student_lite') THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      ep.subject_id,
      ep.grade_level_id,
      gl.name,
      s.name,
      ep.year,
      ep.month,  -- Returns INTEGER
      TRUE as is_accessible,
      FALSE as is_recently_accessed,
      c.last_accessed,
      'accessible'::TEXT as access_status
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    LEFT JOIN (
      SELECT exam_paper_id, MAX(updated_at) as last_accessed
      FROM conversations
      WHERE user_id = p_user_id
      GROUP BY exam_paper_id
    ) c ON ep.id = c.exam_paper_id
    WHERE
      (v_subscription.selected_grade_id IS NULL OR ep.grade_level_id = v_subscription.selected_grade_id)
      AND
      (v_subscription.selected_subject_ids IS NULL OR
       array_length(v_subscription.selected_subject_ids, 1) = 0 OR
       ep.subject_id = ANY(v_subscription.selected_subject_ids))
    ORDER BY gl.display_order, s.name, ep.year DESC, ep.month;
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_paper_access_status IS 'Returns all papers with their access status for a user. Fixed month type from TEXT to INTEGER to match exam_papers table.';
