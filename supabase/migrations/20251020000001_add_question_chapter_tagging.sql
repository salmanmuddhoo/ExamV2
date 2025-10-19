-- Add Question-to-Chapter Tagging System
-- This migration creates the relationship between exam questions and syllabus chapters

-- Create junction table for many-to-many relationship between questions and chapters
CREATE TABLE IF NOT EXISTS question_chapter_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES syllabus_chapters(id) ON DELETE CASCADE,

  -- AI confidence score for this match (0.00 to 1.00)
  confidence_score numeric(3, 2) NOT NULL DEFAULT 0.00,

  -- Is this the primary chapter for this question?
  is_primary boolean DEFAULT false,

  -- AI reasoning for the match (optional)
  match_reasoning text,

  -- Manual override flag
  is_manually_set boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure unique question-chapter pairs
  UNIQUE(question_id, chapter_id)
);

-- Create indexes for fast lookups
CREATE INDEX idx_question_chapter_tags_question ON question_chapter_tags(question_id);
CREATE INDEX idx_question_chapter_tags_chapter ON question_chapter_tags(chapter_id);
CREATE INDEX idx_question_chapter_tags_primary ON question_chapter_tags(question_id, is_primary) WHERE is_primary = true;
CREATE INDEX idx_question_chapter_tags_confidence ON question_chapter_tags(confidence_score DESC);

-- Add syllabus_id to exam_questions for quick reference
-- (denormalized for performance - we can get syllabus from subject + grade)
ALTER TABLE exam_questions
ADD COLUMN IF NOT EXISTS syllabus_id uuid REFERENCES syllabus(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exam_questions_syllabus ON exam_questions(syllabus_id);

-- Enable Row Level Security
ALTER TABLE question_chapter_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for question_chapter_tags
CREATE POLICY "Anyone can view question chapter tags"
  ON question_chapter_tags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert question chapter tags"
  ON question_chapter_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update question chapter tags"
  ON question_chapter_tags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete question chapter tags"
  ON question_chapter_tags FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_question_chapter_tags_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_question_chapter_tags_timestamp
  BEFORE UPDATE ON question_chapter_tags
  FOR EACH ROW
  EXECUTE FUNCTION update_question_chapter_tags_timestamp();

-- Create view for easy querying of questions with their chapters
CREATE OR REPLACE VIEW question_with_chapters AS
SELECT
  eq.id as question_id,
  eq.exam_paper_id,
  eq.question_number,
  eq.ocr_text,
  eq.image_url,
  eq.image_urls,
  eq.syllabus_id,
  ep.subject_id,
  ep.grade_level_id,
  ep.title as exam_title,
  ep.year as exam_year,
  ep.month as exam_month,
  json_agg(
    json_build_object(
      'chapter_id', sc.id,
      'chapter_number', sc.chapter_number,
      'chapter_title', sc.chapter_title,
      'confidence_score', qct.confidence_score,
      'is_primary', qct.is_primary,
      'match_reasoning', qct.match_reasoning
    ) ORDER BY qct.is_primary DESC, qct.confidence_score DESC
  ) FILTER (WHERE sc.id IS NOT NULL) as chapters
FROM exam_questions eq
INNER JOIN exam_papers ep ON eq.exam_paper_id = ep.id
LEFT JOIN question_chapter_tags qct ON eq.id = qct.question_id
LEFT JOIN syllabus_chapters sc ON qct.chapter_id = sc.id
GROUP BY eq.id, ep.id;

-- Grant access to the view
GRANT SELECT ON question_with_chapters TO authenticated;
GRANT SELECT ON question_with_chapters TO anon;
