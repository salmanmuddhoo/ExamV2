-- Create token usage tracking table for cost monitoring
-- This helps track AI model usage and calculate costs over time

CREATE TABLE IF NOT EXISTS token_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  exam_paper_id uuid REFERENCES exam_papers(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  question_number text,
  model text NOT NULL,
  provider text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  estimated_cost numeric(10, 6) NOT NULL DEFAULT 0,
  images_count integer DEFAULT 0,
  is_follow_up boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_user ON token_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_exam_paper ON token_usage_logs(exam_paper_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_created_at ON token_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_user_date ON token_usage_logs(user_id, created_at);

-- Enable Row Level Security
ALTER TABLE token_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for token_usage_logs
-- Admins can view all logs
CREATE POLICY "Admins can view all token usage logs"
  ON token_usage_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Users can view their own logs
CREATE POLICY "Users can view their own token usage logs"
  ON token_usage_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- System/Edge functions can insert logs
CREATE POLICY "Service role can insert token usage logs"
  ON token_usage_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE token_usage_logs IS 'Tracks token usage and costs for AI model interactions';
COMMENT ON COLUMN token_usage_logs.prompt_tokens IS 'Number of tokens in the input/prompt';
COMMENT ON COLUMN token_usage_logs.completion_tokens IS 'Number of tokens in the AI response';
COMMENT ON COLUMN token_usage_logs.estimated_cost IS 'Estimated cost in USD based on model pricing';
