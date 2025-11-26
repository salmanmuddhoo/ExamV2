-- Restore unrestricted paper viewing for all users
--
-- Issue: Migration 20251026000006 incorrectly restricted paper VIEWING based on subscription
-- This violates the core principle: Paper Viewing = Unrestricted, Chat Usage = Restricted
--
-- Fix: All users (regardless of tier) can VIEW and BROWSE all exam papers
--      Chat assistant access remains restricted (enforced by can_user_use_chat_for_paper function)

-- Drop all existing SELECT policies on exam_papers
DROP POLICY IF EXISTS "Users can view papers based on subscription tier" ON exam_papers;
DROP POLICY IF EXISTS "Authenticated users can view all exam papers" ON exam_papers;
DROP POLICY IF EXISTS "Anonymous users can view all exam papers" ON exam_papers;

-- Restore unrestricted paper viewing for authenticated users
CREATE POLICY "Authenticated users can view all exam papers"
  ON exam_papers
  FOR SELECT
  TO authenticated
  USING (true);

-- Ensure anonymous users can also browse papers (before signup)
CREATE POLICY "Anonymous users can view all exam papers"
  ON exam_papers
  FOR SELECT
  TO anon
  USING (true);

-- Add explanatory comment
COMMENT ON POLICY "Authenticated users can view all exam papers" ON exam_papers IS
'Allows all authenticated users to view and browse ALL exam papers regardless of subscription tier.
Chat assistant access is restricted separately based on subscription (see can_user_use_chat_for_paper function).

Design Principle:
- Paper Viewing = Unrestricted (anyone can browse any paper)
- Chat Usage = Restricted (based on subscription tier and subject selection)';

COMMENT ON POLICY "Anonymous users can view all exam papers" ON exam_papers IS
'Allows anonymous users to browse exam papers before signing up.
This enables potential customers to see available content before committing to a subscription.';
