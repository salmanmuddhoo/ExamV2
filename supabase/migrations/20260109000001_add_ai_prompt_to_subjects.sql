-- Migration: Move AI Prompt from exam paper level to subject level
-- This allows all exam papers of a subject to share the same AI assistant prompt

-- Step 1: Add ai_prompt_id column to subjects table
ALTER TABLE subjects
ADD COLUMN ai_prompt_id UUID REFERENCES ai_prompts(id) ON DELETE SET NULL;

-- Step 2: Create index for performance
CREATE INDEX IF NOT EXISTS idx_subjects_ai_prompt_id ON subjects(ai_prompt_id);

-- Step 3: Migrate existing AI prompts from exam_papers to subjects
-- Strategy: For each subject, find the most commonly used AI prompt from its exam papers
-- and set it as the subject's default AI prompt

WITH subject_prompt_usage AS (
  SELECT
    ep.subject_id,
    ep.ai_prompt_id,
    COUNT(*) as usage_count,
    ROW_NUMBER() OVER (PARTITION BY ep.subject_id ORDER BY COUNT(*) DESC, MAX(ep.created_at) DESC) as rn
  FROM exam_papers ep
  WHERE ep.ai_prompt_id IS NOT NULL
  GROUP BY ep.subject_id, ep.ai_prompt_id
)
UPDATE subjects s
SET ai_prompt_id = spu.ai_prompt_id
FROM subject_prompt_usage spu
WHERE s.id = spu.subject_id
  AND spu.rn = 1;

-- Step 4: Add comment to document the change
COMMENT ON COLUMN subjects.ai_prompt_id IS 'AI Assistant prompt to use for all exam papers of this subject. Exam papers will inherit this prompt from their subject.';
