-- Add function to check if user can access a specific exam paper based on their subscription
CREATE OR REPLACE FUNCTION can_user_access_paper(
  p_user_id UUID,
  p_paper_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_subscription RECORD;
  v_tier RECORD;
  v_paper RECORD;
BEGIN
  -- Get user's active subscription
  SELECT us.*, st.name as tier_name, st.can_select_grade, st.can_select_subjects
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  LIMIT 1;

  -- If no subscription, deny access
  IF v_subscription IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Pro tier has access to all papers
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

  -- Free tier: Check paper limits
  IF v_subscription.tier_name = 'free' THEN
    -- Check if paper limit exceeded
    IF v_subscription.papers_accessed_current_period >= (
      SELECT papers_limit FROM subscription_tiers WHERE id = v_subscription.tier_id
    ) THEN
      -- Check if this paper was already accessed in current period
      IF v_paper_id = ANY(v_subscription.accessed_paper_ids) THEN
        RETURN TRUE; -- Allow re-accessing already accessed papers
      ELSE
        RETURN FALSE; -- Limit exceeded
      END IF;
    ELSE
      RETURN TRUE; -- Under limit
    END IF;
  END IF;

  -- Student tier: Check grade and subject restrictions
  IF v_subscription.tier_name = 'student' THEN
    -- Check if grade matches
    IF v_subscription.selected_grade_id IS NOT NULL AND
       v_paper.grade_level_id != v_subscription.selected_grade_id THEN
      RETURN FALSE;
    END IF;

    -- Check if subject is in selected subjects
    IF v_subscription.selected_subject_ids IS NOT NULL AND
       array_length(v_subscription.selected_subject_ids, 1) > 0 AND
       NOT (v_paper.subject_id = ANY(v_subscription.selected_subject_ids)) THEN
      RETURN FALSE;
    END IF;

    RETURN TRUE;
  END IF;

  -- Default: deny access
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Drop old unrestricted policy
DROP POLICY IF EXISTS "Anyone can view exam papers" ON exam_papers;
DROP POLICY IF EXISTS "Users can view exam papers based on subscription" ON exam_papers;

-- Add new RLS policy to exam_papers table to enforce student package restrictions
CREATE POLICY "Users can view exam papers based on subscription"
  ON exam_papers
  FOR SELECT
  TO authenticated
  USING (
    -- Admins can see all papers
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR
    -- Regular users must have access based on their subscription
    can_user_access_paper(auth.uid(), id)
  );

-- Allow anonymous users to see all papers (for browsing before signup)
CREATE POLICY "Anonymous users can view all exam papers"
  ON exam_papers
  FOR SELECT
  TO anon
  USING (true);

-- Add helper function to get accessible papers for a user (for UI filtering)
CREATE OR REPLACE FUNCTION get_accessible_papers_for_user(p_user_id UUID)
RETURNS TABLE (
  paper_id UUID,
  paper_title TEXT,
  grade_name TEXT,
  subject_name TEXT
) AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get user's active subscription
  SELECT us.*, st.name as tier_name
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id AND us.status = 'active'
  LIMIT 1;

  -- If no subscription, return empty
  IF v_subscription IS NULL THEN
    RETURN;
  END IF;

  -- Pro tier: Return all papers
  IF v_subscription.tier_name = 'pro' THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      gl.name,
      s.name
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    ORDER BY gl.display_order, s.name, ep.title;
    RETURN;
  END IF;

  -- Free tier: Return all papers (but access will be limited by paper count)
  IF v_subscription.tier_name = 'free' THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      gl.name,
      s.name
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    ORDER BY gl.display_order, s.name, ep.title;
    RETURN;
  END IF;

  -- Student tier: Return only papers matching grade and subjects
  IF v_subscription.tier_name = 'student' THEN
    RETURN QUERY
    SELECT
      ep.id,
      ep.title,
      gl.name,
      s.name
    FROM exam_papers ep
    JOIN grade_levels gl ON ep.grade_level_id = gl.id
    JOIN subjects s ON ep.subject_id = s.id
    WHERE
      (v_subscription.selected_grade_id IS NULL OR ep.grade_level_id = v_subscription.selected_grade_id)
      AND
      (v_subscription.selected_subject_ids IS NULL OR
       array_length(v_subscription.selected_subject_ids, 1) = 0 OR
       ep.subject_id = ANY(v_subscription.selected_subject_ids))
    ORDER BY gl.display_order, s.name, ep.title;
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Add comments
COMMENT ON FUNCTION can_user_access_paper IS 'Checks if a user can access a specific exam paper based on their subscription tier and selections';
COMMENT ON FUNCTION get_accessible_papers_for_user IS 'Returns list of exam papers accessible to a user based on their subscription';
