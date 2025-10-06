-- Add columns to conversation_messages table to support context caching

-- Add question_number column to track which question each message is about
ALTER TABLE conversation_messages 
ADD COLUMN IF NOT EXISTS question_number TEXT;

-- Add has_images column to track if images were sent with this message
ALTER TABLE conversation_messages 
ADD COLUMN IF NOT EXISTS has_images BOOLEAN DEFAULT false;

-- Add index for faster queries by question_number
CREATE INDEX IF NOT EXISTS idx_conversation_messages_question_number 
ON conversation_messages(conversation_id, question_number);

-- Add index for efficient conversation history loading
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_created 
ON conversation_messages(conversation_id, created_at DESC);

-- Optional: Add a column to track token usage for cost analysis
ALTER TABLE conversation_messages 
ADD COLUMN IF NOT EXISTS tokens_used INTEGER;

-- Optional: Add metadata column for additional context
ALTER TABLE conversation_messages 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN conversation_messages.question_number IS 'The question number this message refers to (e.g., "2", "5")';
COMMENT ON COLUMN conversation_messages.has_images IS 'Whether images were sent to the AI with this message';
COMMENT ON COLUMN conversation_messages.tokens_used IS 'Number of tokens used for this message (for cost tracking)';
COMMENT ON COLUMN conversation_messages.metadata IS 'Additional metadata like isFollowUp, imagesCount, etc.';