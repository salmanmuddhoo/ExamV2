-- Add is_active column to subjects table for activation toggle
-- This allows admins to hide subjects from students even when they have resources attached

-- Add is_active column to subjects table
ALTER TABLE subjects
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_subjects_is_active ON subjects(is_active);

-- Add syllabus_id column to token_usage_logs for tracking syllabus extraction costs
ALTER TABLE token_usage_logs
ADD COLUMN IF NOT EXISTS syllabus_id UUID REFERENCES syllabus(id) ON DELETE SET NULL;

-- Create index for syllabus_id lookups
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_syllabus ON token_usage_logs(syllabus_id);

-- Update source for any existing records that have syllabus_id but no source
UPDATE token_usage_logs
SET source = 'syllabus_upload'
WHERE syllabus_id IS NOT NULL AND (source IS NULL OR source = 'exam_paper_upload');

-- Add comments
COMMENT ON COLUMN subjects.is_active IS 'Whether the subject is active and visible to students';
COMMENT ON COLUMN token_usage_logs.syllabus_id IS 'Reference to syllabus for syllabus extraction operations';

-- Update get_accessible_subjects_for_user to filter by is_active
CREATE OR REPLACE FUNCTION get_accessible_subjects_for_user(p_user_id UUID, p_grade_id UUID DEFAULT NULL)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT
) AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get user's active subscription
  SELECT us.*, st.name as tier_name, st.can_select_subjects
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  LIMIT 1;

  -- If no subscription, return empty
  IF v_subscription IS NULL THEN
    RETURN;
  END IF;

  -- Pro and Free tier: Return all active subjects (optionally filtered by grade)
  IF v_subscription.tier_name IN ('pro', 'free') THEN
    IF p_grade_id IS NOT NULL THEN
      RETURN QUERY
      SELECT DISTINCT s.id, s.name
      FROM subjects s
      JOIN exam_papers ep ON s.id = ep.subject_id
      WHERE ep.grade_level_id = p_grade_id
        AND s.is_active = TRUE
      ORDER BY s.name;
    ELSE
      RETURN QUERY
      SELECT id, name
      FROM subjects
      WHERE is_active = TRUE
      ORDER BY name;
    END IF;
    RETURN;
  END IF;

  -- Student and Student Lite tiers with subject selection
  IF v_subscription.tier_name IN ('student', 'student_lite') AND v_subscription.can_select_subjects THEN
    -- Return only selected subjects that are active
    IF v_subscription.selected_subject_ids IS NOT NULL AND
       array_length(v_subscription.selected_subject_ids, 1) > 0 THEN
      RETURN QUERY
      SELECT id, name
      FROM subjects
      WHERE id = ANY(v_subscription.selected_subject_ids)
        AND is_active = TRUE
      ORDER BY name;
    END IF;
    RETURN;
  END IF;

  -- Default: Return all active subjects
  IF p_grade_id IS NOT NULL THEN
    RETURN QUERY
    SELECT DISTINCT s.id, s.name
    FROM subjects s
    JOIN exam_papers ep ON s.id = ep.subject_id
    WHERE ep.grade_level_id = p_grade_id
      AND s.is_active = TRUE
    ORDER BY s.name;
  ELSE
    RETURN QUERY
    SELECT id, name
    FROM subjects
    WHERE is_active = TRUE
    ORDER BY name;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update get_accessible_papers_for_user to filter by subject is_active
CREATE OR REPLACE FUNCTION get_accessible_papers_for_user(p_user_id UUID)
RETURNS TABLE (
  paper_id UUID,
  paper_title TEXT,
  grade_name TEXT,
  subject_name TEXT
) AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get user's active subscription
  SELECT us.*, st.name as tier_name
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  LIMIT 1;

  -- If no subscription, return empty
  IF v_subscription IS NULL THEN
    RETURN;
  END IF;

  -- Pro tier: Return all papers from active subjects
  IF v_subscription.tier_name = 'pro' THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      gl.name,
      s.name
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    WHERE s.is_active = TRUE
    ORDER BY gl.display_order, s.name, ep.title;
    RETURN;
  END IF;

  -- Free tier: Return all papers from active subjects (but access will be limited by paper count)
  IF v_subscription.tier_name = 'free' THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      gl.name,
      s.name
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    WHERE s.is_active = TRUE
    ORDER BY gl.display_order, s.name, ep.title;
    RETURN;
  END IF;

  -- Student and Student Lite tiers: Return only papers matching grade and subjects that are active
  IF v_subscription.tier_name IN ('student', 'student_lite') THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      gl.name,
      s.name
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    WHERE
      s.is_active = TRUE
      AND (v_subscription.selected_grade_id IS NULL OR ep.grade_level_id = v_subscription.selected_grade_id)
      AND
      (v_subscription.selected_subject_ids IS NULL OR
       array_length(v_subscription.selected_subject_ids, 1) = 0 OR
       ep.subject_id = ANY(v_subscription.selected_subject_ids))
    ORDER BY gl.display_order, s.name, ep.title;
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update can_user_access_paper to check subject is_active
CREATE OR REPLACE FUNCTION can_user_access_paper(
  p_user_id UUID,
  p_paper_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_subscription RECORD;
  v_tier RECORD;
  v_paper RECORD;
  v_subject_active BOOLEAN;
BEGIN
  -- Get user's active subscription with tier info
  SELECT us.*, st.name as tier_name, st.can_select_grade, st.can_select_subjects, st.chapter_wise_access
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  LIMIT 1;

  -- If no subscription, deny access
  IF v_subscription IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get paper details including subject active status
  SELECT ep.grade_level_id, ep.subject_id, s.is_active
  INTO v_paper.grade_level_id, v_paper.subject_id, v_subject_active
  FROM exam_papers ep
  JOIN subjects s ON ep.subject_id = s.id
  WHERE ep.id = p_paper_id;

  IF v_paper.grade_level_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if subject is active
  IF NOT v_subject_active THEN
    RETURN FALSE;
  END IF;

  -- Pro tier has access to all papers from active subjects
  IF v_subscription.tier_name = 'pro' THEN
    RETURN TRUE;
  END IF;

  -- Free tier: Check paper limits
  IF v_subscription.tier_name = 'free' THEN
    -- Check if paper limit exceeded
    IF v_subscription.papers_accessed_current_period >= (
      SELECT papers_limit FROM subscription_tiers WHERE id = v_subscription.tier_id
    ) THEN
      -- Check if this paper was already accessed in current period
      IF p_paper_id = ANY(v_subscription.accessed_paper_ids) THEN
        RETURN TRUE; -- Allow re-accessing already accessed papers
      ELSE
        RETURN FALSE; -- Limit exceeded
      END IF;
    ELSE
      RETURN TRUE; -- Under limit
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
