-- Disable chapter-wise access for free tier
-- Free tier users should only have access to yearly exam papers, not chapter-wise questions
-- The chapter option will be shown as locked in the UI

UPDATE subscription_tiers
SET chapter_wise_access = FALSE
WHERE name = 'free';

-- Update the comment to clarify access levels
COMMENT ON COLUMN subscription_tiers.chapter_wise_access IS
'Whether tier allows access to chapter-wise practice. Free tier: FALSE (locked but visible), Student/Student Lite/Pro: TRUE (unlocked).';
