-- Fix access control: Allow viewing all papers, restrict CHAT ASSISTANT usage
-- This migration corrects the approach from restricting paper viewing to restricting chat usage

-- First, restore the ability for all authenticated users to view exam papers
DROP POLICY IF EXISTS "Users can view exam papers based on subscription" ON exam_papers;
DROP POLICY IF EXISTS "Anonymous users can view all exam papers" ON exam_papers;

-- Restore unrestricted paper viewing for authenticated users
CREATE POLICY "Authenticated users can view all exam papers"
  ON exam_papers
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow anonymous users to view all papers (for browsing before signup)
CREATE POLICY "Anonymous users can view all exam papers"
  ON exam_papers
  FOR SELECT
  TO anon
  USING (true);

-- Rename the old function to clarify it's for chat access, not paper viewing
DROP FUNCTION IF EXISTS can_user_access_paper(UUID, UUID);
DROP FUNCTION IF EXISTS get_accessible_papers_for_user(UUID);

-- Create new function to check if user can use CHAT ASSISTANT with a specific paper
CREATE OR REPLACE FUNCTION can_user_use_chat_for_paper(
  p_user_id UUID,
  p_paper_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_subscription RECORD;
  v_paper RECORD;
BEGIN
  -- Get user's active subscription
  SELECT us.*, st.name as tier_name, st.can_select_grade, st.can_select_subjects, st.token_limit
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  LIMIT 1;

  -- If no subscription, deny chat access
  IF v_subscription IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Pro tier has unlimited chat access to all papers
  IF v_subscription.tier_name = 'pro' THEN
    RETURN TRUE;
  END IF;

  -- Get paper details
  SELECT grade_level_id, subject_id
  INTO v_paper
  FROM exam_papers
  WHERE id = p_paper_id;

  IF v_paper IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Free tier: Check token limits only (can chat with any paper, but limited by token count)
  IF v_subscription.tier_name = 'free' THEN
    -- Check if token limit exceeded
    IF v_subscription.tokens_used_current_period >= v_subscription.token_limit THEN
      RETURN FALSE; -- No tokens left
    ELSE
      RETURN TRUE; -- Has tokens remaining
    END IF;
  END IF;

  -- Student tier: Check grade and subject restrictions for chat access
  IF v_subscription.tier_name = 'student' THEN
    -- Check if grade matches
    IF v_subscription.selected_grade_id IS NOT NULL AND
       v_paper.grade_level_id != v_subscription.selected_grade_id THEN
      RETURN FALSE; -- Wrong grade
    END IF;

    -- Check if subject is in selected subjects
    IF v_subscription.selected_subject_ids IS NOT NULL AND
       array_length(v_subscription.selected_subject_ids, 1) > 0 AND
       NOT (v_paper.subject_id = ANY(v_subscription.selected_subject_ids)) THEN
      RETURN FALSE; -- Subject not in package
    END IF;

    -- Check token limits for student tier
    IF v_subscription.token_limit IS NOT NULL AND
       v_subscription.tokens_used_current_period >= v_subscription.token_limit THEN
      RETURN FALSE; -- No tokens left
    END IF;

    RETURN TRUE; -- Grade and subject match, has tokens
  END IF;

  -- Default: deny access
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create helper function to get papers user can CHAT with (for UI filtering/indicators)
CREATE OR REPLACE FUNCTION get_chat_accessible_papers_for_user(p_user_id UUID)
RETURNS TABLE (
  paper_id UUID,
  paper_title TEXT,
  grade_name TEXT,
  subject_name TEXT,
  can_chat BOOLEAN
) AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get user's active subscription
  SELECT us.*, st.name as tier_name, st.token_limit
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  LIMIT 1;

  -- If no subscription, return all papers with can_chat = false
  IF v_subscription IS NULL THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      gl.name,
      s.name,
      false as can_chat
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    ORDER BY gl.display_order, s.name, ep.title;
    RETURN;
  END IF;

  -- Pro tier: All papers can be chatted with
  IF v_subscription.tier_name = 'pro' THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      gl.name,
      s.name,
      true as can_chat
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    ORDER BY gl.display_order, s.name, ep.title;
    RETURN;
  END IF;

  -- Free tier: All papers visible, but check token limit for can_chat
  IF v_subscription.tier_name = 'free' THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      gl.name,
      s.name,
      (v_subscription.tokens_used_current_period < v_subscription.token_limit) as can_chat
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    ORDER BY gl.display_order, s.name, ep.title;
    RETURN;
  END IF;

  -- Student tier: All papers visible, but only matching grade/subjects can be chatted with
  IF v_subscription.tier_name = 'student' THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      gl.name,
      s.name,
      (
        (v_subscription.selected_grade_id IS NULL OR ep.grade_level_id = v_subscription.selected_grade_id)
        AND
        (v_subscription.selected_subject_ids IS NULL OR
         array_length(v_subscription.selected_subject_ids, 1) = 0 OR
         ep.subject_id = ANY(v_subscription.selected_subject_ids))
        AND
        (v_subscription.token_limit IS NULL OR v_subscription.tokens_used_current_period < v_subscription.token_limit)
      ) as can_chat
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    ORDER BY gl.display_order, s.name, ep.title;
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Add comments
COMMENT ON FUNCTION can_user_use_chat_for_paper IS 'Checks if a user can use the CHAT ASSISTANT with a specific exam paper based on their subscription tier and selections. Note: All users can VIEW papers, this only restricts CHAT usage.';
COMMENT ON FUNCTION get_chat_accessible_papers_for_user IS 'Returns list of exam papers with chat accessibility flags. All papers are returned (viewable), but can_chat indicates if user can use chat assistant with that paper.';
