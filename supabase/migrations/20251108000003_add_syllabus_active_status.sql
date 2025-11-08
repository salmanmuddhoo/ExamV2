-- Add is_active field to syllabus table and enforce one active syllabus per subject-grade

-- Add is_active column to syllabus table
ALTER TABLE syllabus
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN syllabus.is_active IS 'Indicates if this syllabus is the active one for the subject-grade combination. Only one syllabus can be active per subject-grade.';

-- Create function to enforce only one active syllabus per subject-grade
CREATE OR REPLACE FUNCTION enforce_single_active_syllabus()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting this syllabus to active
  IF NEW.is_active = true THEN
    -- Deactivate all other syllabi for the same subject-grade combination
    UPDATE syllabus
    SET is_active = false, updated_at = now()
    WHERE subject_id = NEW.subject_id
      AND grade_id = NEW.grade_id
      AND id != NEW.id
      AND is_active = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce single active syllabus
DROP TRIGGER IF EXISTS trigger_enforce_single_active_syllabus ON syllabus;
CREATE TRIGGER trigger_enforce_single_active_syllabus
  BEFORE INSERT OR UPDATE OF is_active
  ON syllabus
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_active_syllabus();

-- Create index for better performance on active syllabus queries
CREATE INDEX IF NOT EXISTS idx_syllabus_active_subject_grade
  ON syllabus(subject_id, grade_id, is_active)
  WHERE is_active = true;

COMMENT ON FUNCTION enforce_single_active_syllabus IS 'Automatically deactivates other syllabi when one is set to active for a subject-grade combination';
