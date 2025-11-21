-- Create subject_grade_activation table for per-grade subject control
-- This allows subjects to be enabled/disabled for specific grades
-- For example: Computer Science can be disabled for O Level but enabled for A Level

CREATE TABLE IF NOT EXISTS subject_grade_activation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  grade_id UUID NOT NULL REFERENCES grade_levels(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(subject_id, grade_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subject_grade_activation_subject_id ON subject_grade_activation(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_grade_activation_grade_id ON subject_grade_activation(grade_id);
CREATE INDEX IF NOT EXISTS idx_subject_grade_activation_is_active ON subject_grade_activation(is_active);

-- Add comment for documentation
COMMENT ON TABLE subject_grade_activation IS 'Controls subject visibility per grade level. Allows granular control over which subjects are available for each grade.';

-- Migrate existing data: Create records for all subject-grade combinations based on current subjects.is_active
INSERT INTO subject_grade_activation (subject_id, grade_id, is_active)
SELECT s.id, g.id, s.is_active
FROM subjects s
CROSS JOIN grade_levels g
ON CONFLICT (subject_id, grade_id) DO NOTHING;

-- Update RPC function: get_accessible_subjects_for_user
-- Now checks subject_grade_activation instead of subjects.is_active
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
    -- Admin: Return all subjects that are active for the specified grade
    RETURN QUERY
    SELECT s.id, s.name, s.description
    FROM subjects s
    INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id
    WHERE sga.grade_id = p_grade_id AND sga.is_active = TRUE
    ORDER BY s.name;
  ELSE
    -- Student: Return subjects with active exam papers for the specified grade
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
END;
$$;

-- Update RPC function: get_accessible_papers_for_user
-- Now checks subject_grade_activation instead of subjects.is_active
CREATE OR REPLACE FUNCTION get_accessible_papers_for_user(p_user_id UUID, p_grade_id UUID, p_subject_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  title TEXT,
  subject_id UUID,
  grade_level_id UUID,
  year INTEGER,
  pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = p_user_id AND profiles.role = 'admin'
  ) THEN
    -- Admin: Return all papers for active subjects in the specified grade
    RETURN QUERY
    SELECT ep.id, ep.title, ep.subject_id, ep.grade_level_id, ep.year, ep.pdf_url, ep.created_at
    FROM exam_papers ep
    INNER JOIN subjects s ON ep.subject_id = s.id
    INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id AND ep.grade_level_id = sga.grade_id
    WHERE ep.grade_level_id = p_grade_id
      AND sga.is_active = TRUE
      AND (p_subject_id IS NULL OR ep.subject_id = p_subject_id)
    ORDER BY ep.created_at DESC;
  ELSE
    -- Student: Return papers for active subjects in the specified grade
    RETURN QUERY
    SELECT ep.id, ep.title, ep.subject_id, ep.grade_level_id, ep.year, ep.pdf_url, ep.created_at
    FROM exam_papers ep
    INNER JOIN subjects s ON ep.subject_id = s.id
    INNER JOIN subject_grade_activation sga ON s.id = sga.subject_id AND ep.grade_level_id = sga.grade_id
    WHERE ep.grade_level_id = p_grade_id
      AND sga.is_active = TRUE
      AND (p_subject_id IS NULL OR ep.subject_id = p_subject_id)
    ORDER BY ep.created_at DESC;
  END IF;
END;
$$;

-- Update RPC function: can_user_access_paper
-- Now checks subject_grade_activation instead of subjects.is_active
CREATE OR REPLACE FUNCTION can_user_access_paper(p_user_id UUID, p_paper_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_subject_active BOOLEAN;
BEGIN
  -- Check if user is admin
  SELECT (role = 'admin') INTO v_is_admin
  FROM profiles
  WHERE id = p_user_id;

  -- Check if the paper's subject is active for its grade
  SELECT sga.is_active INTO v_subject_active
  FROM exam_papers ep
  INNER JOIN subject_grade_activation sga ON ep.subject_id = sga.subject_id AND ep.grade_level_id = sga.grade_id
  WHERE ep.id = p_paper_id;

  -- Admin can access if subject is active, students can also access if subject is active
  RETURN COALESCE(v_subject_active, FALSE);
END;
$$;
