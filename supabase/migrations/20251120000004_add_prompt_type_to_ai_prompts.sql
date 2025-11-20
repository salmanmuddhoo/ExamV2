-- Add prompt_type column to ai_prompts table
-- Categorizes prompts as either 'ai_assistant' or 'syllabus_extraction'

-- Add prompt_type column with check constraint
ALTER TABLE ai_prompts
ADD COLUMN IF NOT EXISTS prompt_type TEXT NOT NULL DEFAULT 'ai_assistant'
CHECK (prompt_type IN ('ai_assistant', 'syllabus_extraction'));

-- Add comment for documentation
COMMENT ON COLUMN ai_prompts.prompt_type IS 'Type of AI prompt: ai_assistant for exam paper chat assistance, syllabus_extraction for syllabus chapter extraction';

-- Update existing prompts with appropriate types
UPDATE ai_prompts
SET prompt_type = 'ai_assistant'
WHERE name = 'Default Assistant';

UPDATE ai_prompts
SET prompt_type = 'syllabus_extraction'
WHERE name = 'Default Syllabus Extraction';

-- Create index for faster filtering by type
CREATE INDEX IF NOT EXISTS idx_ai_prompts_type ON ai_prompts(prompt_type);
