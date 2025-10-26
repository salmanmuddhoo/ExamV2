-- Fix access control regression: Restore paper viewing restrictions for student/student_lite tiers
-- Issue: Migration 20251012000003 allowed ALL authenticated users to view ALL papers
-- Fix: Student and student_lite users should only see papers matching their selected grade and subjects

-- Drop the overly permissive policy that allows all authenticated users to view all papers
DROP POLICY IF EXISTS "Authenticated users can view all exam papers" ON exam_papers;

-- Create new policy that enforces tier-based access control
CREATE POLICY "Users can view papers based on subscription tier"
  ON exam_papers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM user_subscriptions us
      JOIN subscription_tiers st ON us.tier_id = st.id
      WHERE us.user_id = auth.uid()
        AND us.status = 'active'
        AND (
          -- Pro tier: Full access to all papers
          st.name = 'pro'
          -- Free tier: Can view all papers (chat usage restricted separately)
          OR st.name = 'free'
          -- Student/Student Lite: Only papers matching selected grade and subjects
          OR (
            st.name IN ('student', 'student_lite')
            AND (
              -- Check grade match (or no grade selected yet)
              us.selected_grade_id IS NULL
              OR exam_papers.grade_level_id = us.selected_grade_id
            )
            AND (
              -- Check subject match (or no subjects selected yet)
              us.selected_subject_ids IS NULL
              OR array_length(us.selected_subject_ids, 1) = 0
              OR exam_papers.subject_id = ANY(us.selected_subject_ids)
            )
          )
        )
    )
    -- Also allow if user has no active subscription (fallback to free tier behavior)
    OR NOT EXISTS (
      SELECT 1
      FROM user_subscriptions us
      WHERE us.user_id = auth.uid()
        AND us.status = 'active'
    )
  );

-- Add explanatory comment
COMMENT ON POLICY "Users can view papers based on subscription tier" ON exam_papers IS
'Enforces tier-based access control:
- Pro tier: Access to all papers
- Free tier: Can view all papers (chat restricted separately)
- Student/Student Lite: Only papers matching their selected grade and subjects
- No subscription: Defaults to free tier behavior (view all papers)';
