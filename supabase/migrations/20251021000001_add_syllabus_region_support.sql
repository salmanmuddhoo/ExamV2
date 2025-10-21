-- Add region support to syllabus system
-- This migration allows multiple syllabuses per subject-grade combination (for different regions)

-- Drop the existing unique constraint on (subject_id, grade_id)
ALTER TABLE syllabus DROP CONSTRAINT IF EXISTS syllabus_subject_id_grade_id_key;

-- Add region column
ALTER TABLE syllabus ADD COLUMN IF NOT EXISTS region text;

-- Add new unique constraint on (subject_id, grade_id, region)
-- This allows multiple syllabuses per subject-grade as long as they have different regions
ALTER TABLE syllabus ADD CONSTRAINT syllabus_subject_grade_region_unique
  UNIQUE(subject_id, grade_id, region);

-- Create index on region for faster filtering
CREATE INDEX IF NOT EXISTS idx_syllabus_region ON syllabus(region);

-- Update the view to include region information (if needed for reporting)
COMMENT ON COLUMN syllabus.region IS 'Region/exam board for this syllabus (e.g., Cambridge, Edexcel, National)';
