-- Ensure only one conversation per user per exam paper

-- First, check for and remove any duplicate conversations (keep the oldest one)
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, exam_paper_id
      ORDER BY created_at ASC
    ) as rn
  FROM conversations
)
DELETE FROM conversations
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Drop the index if it exists (to recreate it)
DROP INDEX IF EXISTS idx_conversations_user_paper_unique;

-- Create unique index to prevent duplicate conversations
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_user_paper_unique
ON conversations(user_id, exam_paper_id);

-- Add a comment for documentation
COMMENT ON INDEX idx_conversations_user_paper_unique IS 'Ensures one conversation per user per exam paper';
