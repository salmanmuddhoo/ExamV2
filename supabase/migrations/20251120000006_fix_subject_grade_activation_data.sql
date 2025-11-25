-- Fix subject_grade_activation table data
-- This ensures all subject-grade combinations exist with proper activation status

-- First, ensure all subject-grade combinations exist
-- Use ON CONFLICT to update existing records if they exist
INSERT INTO subject_grade_activation (subject_id, grade_id, is_active)
SELECT s.id, g.id, COALESCE(s.is_active, TRUE)
FROM subjects s
CROSS JOIN grade_levels g
ON CONFLICT (subject_id, grade_id)
DO UPDATE SET is_active = EXCLUDED.is_active;

-- Log the count for verification
DO $$
DECLARE
  record_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO record_count FROM subject_grade_activation;
  RAISE NOTICE 'subject_grade_activation table now has % records', record_count;
END $$;
