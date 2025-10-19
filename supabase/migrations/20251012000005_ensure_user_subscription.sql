-- Function to ensure user has an active subscription (creates free tier if none exists)
CREATE OR REPLACE FUNCTION ensure_user_has_subscription(p_user_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  subscription_id UUID
) AS $$
DECLARE
  v_free_tier_id UUID;
  v_existing_sub_id UUID;
  v_existing_status TEXT;
BEGIN
  -- Check if user already has an active subscription
  SELECT id, status INTO v_existing_sub_id, v_existing_status
  FROM user_subscriptions
  WHERE user_id = p_user_id
  LIMIT 1;

  -- Get free tier ID
  SELECT id INTO v_free_tier_id
  FROM subscription_tiers
  WHERE name = 'free' AND is_active = TRUE
  LIMIT 1;

  IF v_free_tier_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Free tier not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF v_existing_sub_id IS NOT NULL THEN
    -- User has a subscription record - check if it's active or needs reactivation
    IF v_existing_status = 'active' THEN
      RETURN QUERY SELECT TRUE, 'User already has active subscription'::TEXT, v_existing_sub_id;
      RETURN;
    ELSE
      -- Reactivate and update to free tier
      UPDATE user_subscriptions
      SET
        tier_id = v_free_tier_id,
        status = 'active',
        billing_cycle = 'monthly',
        is_recurring = FALSE,
        period_start_date = NOW(),
        period_end_date = NOW() + INTERVAL '30 days',
        tokens_used_current_period = 0,
        papers_accessed_current_period = 0,
        accessed_paper_ids = ARRAY[]::UUID[],
        token_limit_override = NULL,
        cancel_at_period_end = FALSE,
        cancellation_reason = NULL,
        cancellation_requested_at = NULL,
        updated_at = NOW()
      WHERE id = v_existing_sub_id;

      RETURN QUERY SELECT TRUE, 'Reactivated subscription with free tier'::TEXT, v_existing_sub_id;
      RETURN;
    END IF;
  ELSE
    -- No subscription record exists - create one
    INSERT INTO user_subscriptions (
      user_id,
      tier_id,
      status,
      billing_cycle,
      is_recurring,
      period_start_date,
      period_end_date,
      tokens_used_current_period,
      papers_accessed_current_period,
      accessed_paper_ids
    ) VALUES (
      p_user_id,
      v_free_tier_id,
      'active',
      'monthly',
      FALSE,
      NOW(),
      NOW() + INTERVAL '30 days',
      0,
      0,
      ARRAY[]::UUID[]
    )
    RETURNING id INTO v_existing_sub_id;

    RETURN QUERY SELECT TRUE, 'Created free tier subscription'::TEXT, v_existing_sub_id;
    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION ensure_user_has_subscription TO authenticated;

-- Add comment
COMMENT ON FUNCTION ensure_user_has_subscription IS
  'Ensures a user has an active subscription. If they don''t have one, creates a free tier subscription automatically. This is a safety net for users who don''t have subscriptions due to trigger failures or pre-existing accounts.';
