-- Create chapter_conversations table for chapter-based practice
CREATE TABLE IF NOT EXISTS chapter_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES syllabus_chapters(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create chapter_messages table for storing messages
CREATE TABLE IF NOT EXISTS chapter_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chapter_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  question_id uuid REFERENCES exam_questions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_chapter_conversations_user ON chapter_conversations(user_id);
CREATE INDEX idx_chapter_conversations_chapter ON chapter_conversations(chapter_id);
CREATE INDEX idx_chapter_messages_conversation ON chapter_messages(conversation_id);
CREATE INDEX idx_chapter_messages_question ON chapter_messages(question_id);

-- Enable RLS
ALTER TABLE chapter_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chapter_conversations
CREATE POLICY "Users can view their own chapter conversations"
  ON chapter_conversations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own chapter conversations"
  ON chapter_conversations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own chapter conversations"
  ON chapter_conversations FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own chapter conversations"
  ON chapter_conversations FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for chapter_messages
CREATE POLICY "Users can view messages in their conversations"
  ON chapter_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chapter_conversations
      WHERE chapter_conversations.id = chapter_messages.conversation_id
      AND chapter_conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their conversations"
  ON chapter_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chapter_conversations
      WHERE chapter_conversations.id = chapter_messages.conversation_id
      AND chapter_conversations.user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_chapter_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chapter_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation timestamp when new message is added
CREATE TRIGGER update_chapter_conversation_on_message
  AFTER INSERT ON chapter_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chapter_conversation_timestamp();
