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
  v_new_sub_id UUID;
BEGIN
  -- Check if user already has an active subscription
  SELECT id INTO v_existing_sub_id
  FROM user_subscriptions
  WHERE user_id = p_user_id AND status = 'active'
  LIMIT 1;

  IF v_existing_sub_id IS NOT NULL THEN
    -- User already has a subscription
    RETURN QUERY SELECT TRUE, 'User already has active subscription'::TEXT, v_existing_sub_id;
    RETURN;
  END IF;

  -- Get free tier ID
  SELECT id INTO v_free_tier_id
  FROM subscription_tiers
  WHERE name = 'free' AND is_active = TRUE
  LIMIT 1;

  IF v_free_tier_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Free tier not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Create free tier subscription
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
  RETURNING id INTO v_new_sub_id;

  RETURN QUERY SELECT TRUE, 'Created free tier subscription'::TEXT, v_new_sub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION ensure_user_has_subscription TO authenticated;

-- Add comment
COMMENT ON FUNCTION ensure_user_has_subscription IS
  'Ensures a user has an active subscription. If they don''t have one, creates a free tier subscription automatically. This is a safety net for users who don''t have subscriptions due to trigger failures or pre-existing accounts.';
