-- Update subject limits for student and student_lite tiers
-- Student Lite: 1 subject (focused, budget-friendly option)
-- Student: 8 subjects (comprehensive coverage)

-- Update Student Lite to allow 1 subject
UPDATE subscription_tiers
SET
  max_subjects = 1,
  description = 'Access yearly papers and chapter-wise questions for your selected grade and 1 subject'
WHERE name = 'student_lite';

-- Update Student to allow 8 subjects (if not already set)
UPDATE subscription_tiers
SET
  max_subjects = 8,
  description = 'Access yearly papers and chapter-wise questions for your selected grade and up to 8 subjects'
WHERE name = 'student';

-- Update subscription config
UPDATE subscription_config
SET value = '1'
WHERE key = 'student_lite_max_subjects';

-- Add comment explaining the tier differences
COMMENT ON COLUMN subscription_tiers.max_subjects IS
'Maximum number of subjects user can select for this tier. Student Lite: 1 subject, Student: 8 subjects, configurable by admin.';

-- Note: Both tiers have identical access to:
-- - Yearly exam papers (for selected grade + subjects)
-- - Chapter-wise questions (for selected grade + subjects)
-- - Full AI chat assistant
-- The ONLY difference is the number of subjects allowed
