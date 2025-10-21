-- Add syllabus_id to exam_papers table
-- This allows exam papers to be associated with a specific syllabus for chapter tagging

-- Add syllabus_id column to exam_papers
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS syllabus_id uuid REFERENCES syllabus(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_exam_papers_syllabus ON exam_papers(syllabus_id);

-- Comment for documentation
COMMENT ON COLUMN exam_papers.syllabus_id IS 'Reference to the syllabus used for chapter tagging of questions in this exam paper';
