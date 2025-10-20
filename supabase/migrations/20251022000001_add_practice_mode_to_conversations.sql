/*
  # Add Practice Mode to Conversations

  1. Changes
    - Add `practice_mode` column to conversations table ('year' or 'chapter')
    - Add `chapter_id` column for chapter-based conversations
    - Update existing conversations to have 'year' mode
    - Add index on practice_mode for faster filtering

  2. Security
    - No changes to RLS policies needed
*/

-- Add practice_mode column (defaults to 'year' for existing conversations)
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS practice_mode text DEFAULT 'year' CHECK (practice_mode IN ('year', 'chapter'));

-- Add chapter_id column for chapter-based conversations
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES syllabus_chapters(id) ON DELETE CASCADE;

-- Create index for faster filtering by practice mode
CREATE INDEX IF NOT EXISTS idx_conversations_practice_mode ON conversations(practice_mode);
CREATE INDEX IF NOT EXISTS idx_conversations_chapter_id ON conversations(chapter_id);

-- Update existing conversations to have 'year' mode (just to be explicit)
UPDATE conversations SET practice_mode = 'year' WHERE practice_mode IS NULL;

-- Make practice_mode NOT NULL after setting defaults
ALTER TABLE conversations ALTER COLUMN practice_mode SET NOT NULL;
