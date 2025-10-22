-- Add chapter_wise_access column to subscription_tiers
ALTER TABLE subscription_tiers
ADD COLUMN IF NOT EXISTS chapter_wise_access BOOLEAN DEFAULT TRUE;

-- Update existing tiers with chapter_wise_access
UPDATE subscription_tiers
SET chapter_wise_access = TRUE
WHERE name IN ('free', 'student', 'pro');

-- Add comment
COMMENT ON COLUMN subscription_tiers.chapter_wise_access IS 'Whether tier allows access to chapter-wise practice and chat';

-- Insert new "Student lite" tier
INSERT INTO subscription_tiers (
  name,
  display_name,
  description,
  price_monthly,
  price_yearly,
  token_limit,
  papers_limit,
  can_select_grade,
  can_select_subjects,
  max_subjects,
  chapter_wise_access,
  is_active,
  display_order
) VALUES (
  'student_lite',
  'Student Lite',
  'Affordable plan for focused yearly exam preparation',
  8,
  80,
  250000,
  NULL,
  TRUE,
  TRUE,
  1, -- Only 1 subject
  FALSE, -- No chapter-wise access
  TRUE,
  2 -- Between free and student
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  token_limit = EXCLUDED.token_limit,
  max_subjects = EXCLUDED.max_subjects,
  chapter_wise_access = EXCLUDED.chapter_wise_access,
  display_order = EXCLUDED.display_order;

-- Update display order of other tiers
UPDATE subscription_tiers SET display_order = 1 WHERE name = 'free';
UPDATE subscription_tiers SET display_order = 2 WHERE name = 'student_lite';
UPDATE subscription_tiers SET display_order = 3 WHERE name = 'student';
UPDATE subscription_tiers SET display_order = 4 WHERE name = 'pro';

-- Add subscription config for student lite
INSERT INTO subscription_config (key, value, description, value_type) VALUES
('student_lite_token_limit', '250000', 'Token limit for student lite tier per month', 'number'),
('student_lite_max_subjects', '1', 'Maximum subjects for student lite tier', 'number')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;
