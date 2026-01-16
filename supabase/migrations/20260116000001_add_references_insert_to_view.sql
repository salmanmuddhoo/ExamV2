-- Migration: Add references_insert to question_with_chapters view
-- Description: Updates the question_with_chapters view to include the references_insert field
--              so admins can see and manage which questions need the insert PDF
-- Date: 2026-01-16

-- Drop the existing view
DROP VIEW IF EXISTS question_with_chapters;

-- Recreate the view with references_insert field
CREATE OR REPLACE VIEW question_with_chapters AS
SELECT
  eq.id as question_id,
  eq.exam_paper_id,
  eq.question_number,
  eq.ocr_text,
  eq.image_url,
  eq.image_urls,
  eq.syllabus_id,
  eq.references_insert,
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
