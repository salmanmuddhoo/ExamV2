-- Migration: Add Insert PDF Support
-- Description: Enables admins to upload separate "insert" PDFs that contain additional materials
--              (diagrams, graphs, reference materials) referenced by exam questions.
--              Questions that reference the insert will have the insert images sent along
--              with the question images when students query them.
-- Date: 2026-01-09

-- =====================================================
-- 1. ADD INSERT PDF COLUMNS TO EXAM_PAPERS TABLE
-- =====================================================

ALTER TABLE exam_papers
ADD COLUMN insert_pdf_url TEXT,
ADD COLUMN insert_pdf_path TEXT;

-- Add comments explaining the columns
COMMENT ON COLUMN exam_papers.insert_pdf_url IS 'Public URL to the insert PDF containing additional materials (diagrams, graphs) referenced by questions';
COMMENT ON COLUMN exam_papers.insert_pdf_path IS 'Storage path to the insert PDF in Supabase Storage';

-- =====================================================
-- 2. ADD REFERENCES_INSERT FLAG TO EXAM_QUESTIONS TABLE
-- =====================================================

ALTER TABLE exam_questions
ADD COLUMN references_insert BOOLEAN DEFAULT FALSE NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN exam_questions.references_insert IS 'Indicates if this question references the insert PDF. When true, insert images will be sent to AI along with the question.';

-- Add index for performance (filtering questions that reference insert)
CREATE INDEX IF NOT EXISTS idx_exam_questions_references_insert
ON exam_questions(exam_paper_id, references_insert)
WHERE references_insert = TRUE;

-- =====================================================
-- 3. CREATE STORAGE BUCKET FOR INSERT IMAGES (if not exists)
-- =====================================================

-- Note: Storage buckets are usually created via Supabase Dashboard or CLI
-- This is a placeholder for documentation purposes
-- Run: supabase storage create-bucket inserts --public

-- =====================================================
-- 4. VERIFICATION QUERIES
-- =====================================================

-- Query to check exam papers with inserts:
-- SELECT
--   ep.title,
--   ep.insert_pdf_url IS NOT NULL as has_insert,
--   COUNT(eq.id) FILTER (WHERE eq.references_insert = TRUE) as questions_with_insert,
--   COUNT(eq.id) as total_questions
-- FROM exam_papers ep
-- LEFT JOIN exam_questions eq ON eq.exam_paper_id = ep.id
-- GROUP BY ep.id, ep.title, ep.insert_pdf_url
-- ORDER BY ep.created_at DESC;

-- Query to find questions that reference insert:
-- SELECT
--   ep.title as exam_paper,
--   eq.question_number,
--   eq.references_insert,
--   ep.insert_pdf_url
-- FROM exam_questions eq
-- JOIN exam_papers ep ON ep.id = eq.exam_paper_id
-- WHERE eq.references_insert = TRUE
-- ORDER BY ep.title, eq.question_number;
