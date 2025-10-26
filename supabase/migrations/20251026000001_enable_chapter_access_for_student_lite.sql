-- Enable chapter-wise access for student_lite tier
-- Student lite users should have access to both yearly papers and chapter-wise questions
-- for their selected grade and subjects (up to 3 subjects)

-- Update student_lite tier to enable chapter-wise access
UPDATE subscription_tiers
SET
  chapter_wise_access = TRUE,
  max_subjects = 3,  -- Update to 3 subjects as per requirement
  description = 'Access yearly papers and chapter-wise questions for your selected grade and 3 subjects'
WHERE name = 'student_lite';

-- Update subscription config for student lite max subjects
UPDATE subscription_config
SET value = '3'
WHERE key = 'student_lite_max_subjects';

-- Add comment explaining the access model
COMMENT ON COLUMN subscription_tiers.chapter_wise_access IS
'Whether tier allows access to chapter-wise practice. Student/Student Lite can access chapters only for their selected grade and subjects. Other papers are locked.';
