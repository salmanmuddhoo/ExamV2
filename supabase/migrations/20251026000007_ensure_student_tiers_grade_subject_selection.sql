-- Ensure student and student_lite tiers have grade and subject selection enabled
-- This is critical for the purchase flow to show the StudentPackageSelector

-- Update student tier to ensure grade and subject selection is enabled
UPDATE subscription_tiers
SET
  can_select_grade = TRUE,
  can_select_subjects = TRUE
WHERE name = 'student';

-- Update student_lite tier to ensure grade and subject selection is enabled
UPDATE subscription_tiers
SET
  can_select_grade = TRUE,
  can_select_subjects = TRUE
WHERE name = 'student_lite';

-- Add comment
COMMENT ON COLUMN subscription_tiers.can_select_grade IS
'Whether users can select their grade level during purchase. Required for student/student_lite tiers.';

COMMENT ON COLUMN subscription_tiers.can_select_subjects IS
'Whether users can select their subjects during purchase. Required for student/student_lite tiers.';
