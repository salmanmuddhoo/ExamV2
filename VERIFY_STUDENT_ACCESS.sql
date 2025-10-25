-- Verification Script: Check Student Tier Access Control
-- Run this to verify a student/student_lite user's accessible content

-- STEP 1: Check user's subscription and selections
-- Replace 'YOUR_USER_ID' with actual user ID
SELECT
  us.user_id,
  st.name as tier_name,
  gl.name as selected_grade,
  us.selected_subject_ids,
  array(
    SELECT s.name
    FROM subjects s
    WHERE s.id = ANY(us.selected_subject_ids)
  ) as selected_subject_names,
  us.status,
  us.period_end_date
FROM user_subscriptions us
JOIN subscription_tiers st ON us.tier_id = st.id
LEFT JOIN grade_levels gl ON us.selected_grade_id = gl.id
WHERE us.user_id = 'YOUR_USER_ID'
  AND us.status = 'active';

-- Expected Result for Student/Student Lite:
-- Should show:
-- - tier_name: 'student' or 'student_lite'
-- - selected_grade: e.g., 'A Level'
-- - selected_subject_names: e.g., '{Mathematics,Physics,Chemistry}'
--
-- If selected_grade is NULL or selected_subject_names is empty,
-- the user hasn't completed subscription setup properly!

---

-- STEP 2: Test get_accessible_grades_for_user
-- This should ONLY return the selected grade for student tiers
SELECT * FROM get_accessible_grades_for_user('YOUR_USER_ID');

-- Expected Result for Student/Student Lite:
-- Should return ONLY 1 grade (the selected one)
-- e.g., A Level
--
-- Expected Result for Pro/Free:
-- Should return ALL grades

---

-- STEP 3: Test get_accessible_subjects_for_user
-- This should ONLY return the selected subjects for student tiers
SELECT * FROM get_accessible_subjects_for_user('YOUR_USER_ID', NULL);

-- Expected Result for Student/Student Lite:
-- Should return ONLY the selected subjects (max 3)
-- e.g., Mathematics, Physics, Chemistry
--
-- Expected Result for Pro/Free:
-- Should return ALL subjects

---

-- STEP 4: Test get_user_paper_access_status
-- This should ONLY return papers matching selected grade + subjects
SELECT
  paper_id,
  paper_title,
  grade_name,
  subject_name,
  is_accessible,
  access_status
FROM get_user_paper_access_status('YOUR_USER_ID')
ORDER BY grade_name, subject_name, paper_title
LIMIT 20;

-- Expected Result for Student/Student Lite:
-- Should return ONLY papers where:
-- - grade_name matches selected grade (e.g., 'A Level')
-- - subject_name is in selected subjects (e.g., 'Mathematics', 'Physics', 'Chemistry')
-- - is_accessible = TRUE
--
-- Should NOT show:
-- - Papers from other grades
-- - Papers from subjects not in the selection
--
-- Expected Result for Pro:
-- Should return ALL papers with is_accessible = TRUE
--
-- Expected Result for Free:
-- Should return only 2 most recently accessed papers

---

-- STEP 5: Count accessible papers by grade and subject
-- This shows the distribution of accessible papers
SELECT
  grade_name,
  subject_name,
  COUNT(*) as paper_count
FROM get_user_paper_access_status('YOUR_USER_ID')
WHERE is_accessible = TRUE
GROUP BY grade_name, subject_name
ORDER BY grade_name, subject_name;

-- Expected Result for Student with A Level + Math, Physics, Chemistry:
-- A Level | Mathematics | X papers
-- A Level | Physics     | Y papers
-- A Level | Chemistry   | Z papers
-- (No other combinations should appear)

---

-- STEP 6: Verify RLS is working on exam_papers table
-- This checks if Row Level Security properly restricts paper access
SET ROLE authenticated;
SELECT
  ep.id,
  ep.title,
  gl.name as grade,
  s.name as subject
FROM exam_papers ep
JOIN grade_levels gl ON ep.grade_level_id = gl.id
JOIN subjects s ON ep.subject_id = s.id
WHERE can_user_access_paper('YOUR_USER_ID', ep.id) = TRUE
ORDER BY gl.display_order, s.name, ep.title
LIMIT 20;
RESET ROLE;

-- Expected Result:
-- Should match the results from get_user_paper_access_status
-- Only papers the user can access should be returned

---

-- TROUBLESHOOTING:
-- If student tier sees ALL grades/subjects instead of selected ones:
--
-- 1. Check if selections are NULL:
--    SELECT selected_grade_id, selected_subject_ids
--    FROM user_subscriptions
--    WHERE user_id = 'YOUR_USER_ID' AND status = 'active';
--
-- 2. If NULL, the subscription wasn't set up with selections.
--    This can happen if:
--    - User upgraded from free tier and didn't select grade/subjects
--    - Subscription was created manually without selections
--    - There was an error during subscription creation
--
-- 3. To fix, manually set selections:
--    UPDATE user_subscriptions
--    SET
--      selected_grade_id = (SELECT id FROM grade_levels WHERE name = 'A Level'),
--      selected_subject_ids = ARRAY[
--        (SELECT id FROM subjects WHERE name = 'Mathematics'),
--        (SELECT id FROM subjects WHERE name = 'Physics'),
--        (SELECT id FROM subjects WHERE name = 'Chemistry')
--      ]
--    WHERE user_id = 'YOUR_USER_ID' AND status = 'active';
