-- Free Tier Recent Papers Access Control
-- This migration ensures free tier users can only access their 2 most recently accessed papers
-- When they upgrade and downgrade, they retain access to the 2 most recent papers

-- Function to get the most recently accessed paper IDs for a user
-- Returns the paper IDs from the 2 most recently updated conversations
CREATE OR REPLACE FUNCTION get_recent_accessed_papers(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 2
)
RETURNS UUID[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT DISTINCT exam_paper_id
    FROM conversations
    WHERE user_id = p_user_id
    ORDER BY updated_at DESC
    LIMIT p_limit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update can_user_access_paper to use recent papers logic for free tier
CREATE OR REPLACE FUNCTION can_user_access_paper(
  p_user_id UUID,
  p_paper_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_subscription RECORD;
  v_tier RECORD;
  v_paper RECORD;
  v_recent_papers UUID[];
  v_total_accessed INTEGER;
BEGIN
  -- Get user's active subscription with tier info
  SELECT us.*, st.name as tier_name, st.can_select_grade, st.can_select_subjects, st.chapter_wise_access, st.papers_limit
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  LIMIT 1;

  -- If no subscription, deny access
  IF v_subscription IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Pro tier has access to all papers
  IF v_subscription.tier_name = 'pro' THEN
    RETURN TRUE;
  END IF;

  -- Get paper details
  SELECT grade_level_id, subject_id
  INTO v_paper
  FROM exam_papers
  WHERE id = p_paper_id;

  IF v_paper IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Free tier: Check paper limits with recent access logic
  IF v_subscription.tier_name = 'free' THEN
    -- Get count of unique papers accessed (from conversations table)
    SELECT COUNT(DISTINCT exam_paper_id)
    INTO v_total_accessed
    FROM conversations
    WHERE user_id = p_user_id;

    -- If user has accessed less than the free tier limit, allow any paper
    IF v_total_accessed < COALESCE(v_subscription.papers_limit, 2) THEN
      RETURN TRUE;
    END IF;

    -- If user has accessed >= limit, only allow the most recent papers
    v_recent_papers := get_recent_accessed_papers(p_user_id, COALESCE(v_subscription.papers_limit, 2));

    -- Check if the requested paper is in the recent papers list
    IF p_paper_id = ANY(v_recent_papers) THEN
      RETURN TRUE;
    ELSE
      RETURN FALSE; -- Paper not in recent list, deny access
    END IF;
  END IF;

  -- Student and Student Lite tiers: Check grade and subject restrictions
  IF v_subscription.tier_name IN ('student', 'student_lite') THEN
    -- Check if grade matches (if tier has grade selection enabled)
    IF v_subscription.can_select_grade AND v_subscription.selected_grade_id IS NOT NULL THEN
      IF v_paper.grade_level_id != v_subscription.selected_grade_id THEN
        RETURN FALSE;
      END IF;
    END IF;

    -- Check if subject is in selected subjects (if tier has subject selection enabled)
    IF v_subscription.can_select_subjects AND
       v_subscription.selected_subject_ids IS NOT NULL AND
       array_length(v_subscription.selected_subject_ids, 1) > 0 THEN
      IF NOT (v_paper.subject_id = ANY(v_subscription.selected_subject_ids)) THEN
        RETURN FALSE;
      END IF;
    END IF;

    RETURN TRUE;
  END IF;

  -- Default: deny access
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get user's accessible papers with access status
-- This shows which papers are accessible and which are locked for free tier users
CREATE OR REPLACE FUNCTION get_user_paper_access_status(p_user_id UUID)
RETURNS TABLE (
  paper_id UUID,
  paper_title TEXT,
  grade_name TEXT,
  subject_name TEXT,
  year INTEGER,
  month TEXT,
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
      gl.name,
      s.name,
      ep.year,
      ep.month,
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
      gl.name,
      s.name,
      ep.year,
      ep.month,
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
      gl.name,
      s.name,
      ep.year,
      ep.month,
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_recent_accessed_papers(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_paper_access_status(UUID) TO authenticated;

-- Add comments
COMMENT ON FUNCTION get_recent_accessed_papers IS 'Returns array of paper IDs for the N most recently accessed papers by a user';
COMMENT ON FUNCTION can_user_access_paper IS 'Updated to use recent papers logic for free tier users';
COMMENT ON FUNCTION get_user_paper_access_status IS 'Returns all papers with their access status for a user, showing which are accessible, locked, or recently accessed';
