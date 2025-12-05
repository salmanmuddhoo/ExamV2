-- Diagnostic script to check why conversations aren't showing up
-- Run this to see what data exists and what's being returned

-- 1. Check if you have any conversations at all
SELECT
  id,
  title,
  exam_paper_id,
  practice_mode,
  created_at
FROM conversations
WHERE user_id = 'YOUR_USER_ID_HERE'  -- Replace with actual user_id
ORDER BY created_at DESC
LIMIT 10;

-- 2. Check the exam_papers data for those conversations
SELECT
  ep.id,
  ep.title,
  ep.year,
  ep.month,
  ep.subject_id,
  ep.grade_level_id,
  s.name as subject_name,
  gl.name as grade_name
FROM exam_papers ep
LEFT JOIN subjects s ON ep.subject_id = s.id
LEFT JOIN grade_levels gl ON ep.grade_level_id = gl.id
WHERE ep.id IN (
  SELECT exam_paper_id
  FROM conversations
  WHERE user_id = 'YOUR_USER_ID_HERE'  -- Replace with actual user_id
)
ORDER BY ep.created_at DESC;

-- 3. Check if the joins are working with the new syntax
SELECT
  c.id,
  c.title,
  c.created_at,
  c.exam_paper_id,
  c.practice_mode,
  jsonb_build_object(
    'title', ep.title,
    'year', ep.year,
    'month', ep.month,
    'subject_name', s.name,
    'grade_name', gl.name
  ) as exam_paper_data
FROM conversations c
INNER JOIN exam_papers ep ON c.exam_paper_id = ep.id
LEFT JOIN subjects s ON ep.subject_id = s.id
LEFT JOIN grade_levels gl ON ep.grade_level_id = gl.id
WHERE c.user_id = 'YOUR_USER_ID_HERE'  -- Replace with actual user_id
ORDER BY c.created_at DESC
LIMIT 10;

-- 4. Check what the actual Supabase query returns (simulate it)
-- This mimics what the TypeScript code does
SELECT
  c.id,
  c.title,
  c.created_at,
  c.updated_at,
  c.exam_paper_id,
  c.practice_mode,
  c.chapter_id,
  row_to_json(ep_data.*) as exam_papers,
  row_to_json(sc_data.*) as syllabus_chapters
FROM conversations c
INNER JOIN (
  SELECT
    ep.id as exam_paper_id,
    ep.title,
    ep.year,
    ep.month,
    row_to_json((SELECT x FROM (SELECT s.name) x)) as subjects,
    row_to_json((SELECT x FROM (SELECT gl.name) x)) as grade_levels
  FROM exam_papers ep
  LEFT JOIN subjects s ON ep.subject_id = s.id
  LEFT JOIN grade_levels gl ON ep.grade_level_id = gl.id
) ep_data ON ep_data.exam_paper_id = c.exam_paper_id
LEFT JOIN (
  SELECT
    sc.id,
    sc.chapter_number,
    sc.chapter_title
  FROM syllabus_chapters sc
) sc_data ON sc_data.id = c.chapter_id
WHERE c.user_id = 'YOUR_USER_ID_HERE'  -- Replace with actual user_id
ORDER BY c.updated_at DESC;
