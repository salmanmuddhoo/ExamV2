-- SECURITY FIX: Only allow grade/subject selection updates when current selections are NULL
-- This prevents abuse where users could change selections after purchase to access different subjects for free
-- Updates can ONLY be made once (one-time setup for users with NULL selections)

CREATE OR REPLACE FUNCTION update_subscription_selections(
  p_user_id UUID,
  p_grade_id UUID,
  p_subject_ids UUID[]
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_subscription RECORD;
  v_tier_name TEXT;
  v_max_subjects INTEGER;
BEGIN
  -- Get user's active subscription with current selections
  SELECT
    us.id,
    us.tier_id,
    us.selected_grade_id,
    us.selected_subject_ids,
    st.name as tier_name,
    st.max_subjects,
    st.can_select_grade,
    st.can_select_subjects
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id
    AND us.status = 'active';

  -- Check if subscription exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'No active subscription found'::TEXT;
    RETURN;
  END IF;

  v_tier_name := v_subscription.tier_name;
  v_max_subjects := v_subscription.max_subjects;

  -- Check if tier allows selections
  IF NOT v_subscription.can_select_grade OR NOT v_subscription.can_select_subjects THEN
    RETURN QUERY SELECT FALSE, 'Your tier does not support grade and subject selection'::TEXT;
    RETURN;
  END IF;

  -- Only allow for student/student_lite tiers
  IF v_tier_name NOT IN ('student', 'student_lite') THEN
    RETURN QUERY SELECT FALSE, 'Only student and student lite tiers can update selections'::TEXT;
    RETURN;
  END IF;

  -- SECURITY CHECK: Only allow updates if selections are currently NULL
  -- This prevents abuse where users change selections after purchase to access different subjects
  IF v_subscription.selected_grade_id IS NOT NULL OR
     (v_subscription.selected_subject_ids IS NOT NULL AND array_length(v_subscription.selected_subject_ids, 1) > 0) THEN
    RETURN QUERY SELECT FALSE, 'Grade and subject selections are locked after purchase. To change your selections, you need to purchase a new subscription.'::TEXT;
    RETURN;
  END IF;

  -- Validate grade exists
  IF NOT EXISTS (SELECT 1 FROM grade_levels WHERE id = p_grade_id) THEN
    RETURN QUERY SELECT FALSE, 'Invalid grade level'::TEXT;
    RETURN;
  END IF;

  -- Validate subject count
  IF array_length(p_subject_ids, 1) IS NULL OR array_length(p_subject_ids, 1) = 0 THEN
    RETURN QUERY SELECT FALSE, 'You must select at least one subject'::TEXT;
    RETURN;
  END IF;

  IF array_length(p_subject_ids, 1) > v_max_subjects THEN
    RETURN QUERY SELECT FALSE, format('You can only select up to %s subjects', v_max_subjects)::TEXT;
    RETURN;
  END IF;

  -- Validate all subjects exist
  IF array_length(p_subject_ids, 1) != (
    SELECT COUNT(*) FROM subjects WHERE id = ANY(p_subject_ids)
  ) THEN
    RETURN QUERY SELECT FALSE, 'One or more invalid subjects'::TEXT;
    RETURN;
  END IF;

  -- Update subscription (only possible if selections were NULL)
  UPDATE user_subscriptions
  SET
    selected_grade_id = p_grade_id,
    selected_subject_ids = p_subject_ids,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND status = 'active';

  RETURN QUERY SELECT TRUE, 'Subscription selections updated successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_subscription_selections IS
'ONE-TIME SETUP ONLY: Allows student/student_lite users to set their grade and subject selections.
This function can ONLY be called when selections are NULL (initial setup for users who purchased before the selection system).
Once selections are set, they are LOCKED to prevent system abuse. Users cannot change selections after purchase.
To change selections, users must purchase a new subscription with the desired grade and subjects.';
