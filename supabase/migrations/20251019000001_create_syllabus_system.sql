-- Create syllabus table
CREATE TABLE IF NOT EXISTS syllabus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES grade_levels(id) ON DELETE CASCADE,

  -- File information
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,

  -- Processing status
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Metadata
  title text,
  description text,
  academic_year text,

  -- AI extraction metadata
  extraction_metadata jsonb, -- Store AI response and confidence scores
  error_message text,

  -- Audit
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Ensure only one active syllabus per subject-grade combination
  UNIQUE(subject_id, grade_id)
);

-- Create chapters table
CREATE TABLE IF NOT EXISTS syllabus_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_id uuid NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,

  -- Chapter information
  chapter_number integer NOT NULL,
  chapter_title text NOT NULL,
  chapter_description text,

  -- Subtopics as array of text
  subtopics text[],

  -- Ordering
  display_order integer NOT NULL,

  -- AI confidence score
  confidence_score numeric(3, 2), -- 0.00 to 1.00

  -- Manual override flag
  is_manually_edited boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(syllabus_id, chapter_number)
);

-- Create indexes
CREATE INDEX idx_syllabus_subject_grade ON syllabus(subject_id, grade_id);
CREATE INDEX idx_syllabus_status ON syllabus(processing_status);
CREATE INDEX idx_chapters_syllabus ON syllabus_chapters(syllabus_id);
CREATE INDEX idx_chapters_order ON syllabus_chapters(syllabus_id, display_order);

-- Enable RLS
ALTER TABLE syllabus ENABLE ROW LEVEL SECURITY;
ALTER TABLE syllabus_chapters ENABLE ROW LEVEL SECURITY;

-- Syllabus policies
CREATE POLICY "Anyone can view syllabus"
  ON syllabus FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert syllabus"
  ON syllabus FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update syllabus"
  ON syllabus FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete syllabus"
  ON syllabus FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Chapter policies
CREATE POLICY "Anyone can view chapters"
  ON syllabus_chapters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert chapters"
  ON syllabus_chapters FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update chapters"
  ON syllabus_chapters FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete chapters"
  ON syllabus_chapters FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create storage bucket for syllabus files
INSERT INTO storage.buckets (id, name, public)
VALUES ('syllabus-files', 'syllabus-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for syllabus files
CREATE POLICY "Admins can upload syllabus files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'syllabus-files' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Syllabus files are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'syllabus-files');

CREATE POLICY "Admins can update syllabus files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'syllabus-files' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can delete syllabus files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'syllabus-files' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_syllabus_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_syllabus_timestamp
  BEFORE UPDATE ON syllabus
  FOR EACH ROW
  EXECUTE FUNCTION update_syllabus_updated_at();

CREATE TRIGGER update_syllabus_chapters_timestamp
  BEFORE UPDATE ON syllabus_chapters
  FOR EACH ROW
  EXECUTE FUNCTION update_syllabus_updated_at();
