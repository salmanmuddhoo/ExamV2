-- Create AI prompts system
-- Run this SQL in your Supabase dashboard SQL Editor

-- Create ai_prompts table
CREATE TABLE IF NOT EXISTS ai_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  system_prompt text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add ai_prompt_id to exam_papers table
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS ai_prompt_id uuid REFERENCES ai_prompts(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_exam_papers_ai_prompt ON exam_papers(ai_prompt_id);

-- Enable Row Level Security
ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view AI prompts" ON ai_prompts;
DROP POLICY IF EXISTS "Admins can insert AI prompts" ON ai_prompts;
DROP POLICY IF EXISTS "Admins can update AI prompts" ON ai_prompts;
DROP POLICY IF EXISTS "Admins can delete AI prompts" ON ai_prompts;

-- RLS Policies for ai_prompts (public read, admin write)
CREATE POLICY "Anyone can view AI prompts"
  ON ai_prompts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert AI prompts"
  ON ai_prompts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update AI prompts"
  ON ai_prompts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete AI prompts"
  ON ai_prompts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Insert a default AI prompt
INSERT INTO ai_prompts (name, description, system_prompt)
VALUES (
  'Default Assistant',
  'General-purpose exam assistant for all subjects',
  'You are a helpful exam study assistant. You help students understand exam questions and provide guidance. Be clear, encouraging, and educational in your responses.'
)
ON CONFLICT (name) DO NOTHING;

-- Add comment
COMMENT ON TABLE ai_prompts IS 'Stores custom AI assistant prompts that can be assigned to exam papers';
COMMENT ON COLUMN exam_papers.ai_prompt_id IS 'Reference to the AI prompt to use for this exam paper';
