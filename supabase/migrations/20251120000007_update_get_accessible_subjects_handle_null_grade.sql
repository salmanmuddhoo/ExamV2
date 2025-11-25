-- Update get_accessible_subjects_for_user to handle NULL grade_id
-- When grade_id is NULL, return all subjects active in at least one grade

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
BEGIN
  -- Check if user is admin
  IF EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = p_user_id AND profiles.role = 'admin'
  ) THEN
    -- Admin: Return subjects based on grade filter
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
  ELSE
    -- Student: Return subjects with active exam papers
    IF p_grade_id IS NULL THEN
      -- Return all subjects with exam papers that are active in at least one grade
      RETURN QUERY
      SELECT DISTINCT s.id, s.name, s.description
      FROM subjects s
      INNER JOIN exam_papers ep ON s.id = ep.subject_id
      INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id AND ep.grade_level_id = sga.grade_id
      WHERE sga.is_active = TRUE
      ORDER BY s.name;
    ELSE
      -- Return subjects with exam papers for the specified grade
      RETURN QUERY
      SELECT DISTINCT s.id, s.name, s.description
      FROM subjects s
      INNER JOIN exam_papers ep ON s.id = ep.subject_id
      INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id
      WHERE ep.grade_level_id = p_grade_id
        AND sga.grade_id = p_grade_id
        AND sga.is_active = TRUE
      ORDER BY s.name;
    END IF;
  END IF;
END;
$$;
