-- Add month column to exam_papers table
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS month integer;

-- Add check constraint to ensure month is between 1-12 if provided
ALTER TABLE exam_papers ADD CONSTRAINT check_month_range
  CHECK (month IS NULL OR (month >= 1 AND month <= 12));

-- Add comment to the column
COMMENT ON COLUMN exam_papers.month IS 'Month of the exam (1-12), optional';
