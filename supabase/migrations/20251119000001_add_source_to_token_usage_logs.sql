-- Add source column to token_usage_logs for category tracking
-- This allows tracking token consumption by different features:
-- - syllabus_upload: Syllabus PDF extraction
-- - exam_paper_upload: Exam paper question extraction
-- - ai_assistant: Chat assistant interactions
-- - study_plan: Study plan generation

ALTER TABLE token_usage_logs
ADD COLUMN IF NOT EXISTS source text;

-- Create index for efficient category filtering
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_source ON token_usage_logs(source);

-- Update existing records based on current logic:
-- Records with user_id are from ai_assistant (chat)
-- Records without user_id are from exam_paper_upload
UPDATE token_usage_logs
SET source = CASE
  WHEN user_id IS NOT NULL THEN 'ai_assistant'
  ELSE 'exam_paper_upload'
END
WHERE source IS NULL;

COMMENT ON COLUMN token_usage_logs.source IS 'Source/category of token usage: syllabus_upload, exam_paper_upload, ai_assistant, study_plan';
