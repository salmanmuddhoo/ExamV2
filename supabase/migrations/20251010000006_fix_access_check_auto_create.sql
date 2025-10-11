-- Update the check_user_subscription_access function to auto-create free tier if missing
CREATE OR REPLACE FUNCTION check_user_subscription_access(
  p_user_id UUID,
  p_feature TEXT DEFAULT 'chat'
)
RETURNS TABLE (
  has_access BOOLEAN,
  tier_name TEXT,
  reason TEXT,
  tokens_remaining INTEGER,
  papers_remaining INTEGER
) AS $$
DECLARE
  v_subscription RECORD;
  v_tier RECORD;
  v_tokens_remaining INTEGER;
  v_papers_remaining INTEGER;
  v_free_tier_id UUID;
BEGIN
  -- Get active subscription
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id AND status = 'active'
  LIMIT 1;

  -- If no subscription exists, auto-create a free tier subscription
  IF v_subscription IS NULL THEN
    -- Get free tier ID
    SELECT id INTO v_free_tier_id
    FROM subscription_tiers
    WHERE name = 'free' AND is_active = TRUE
    LIMIT 1;

    IF v_free_tier_id IS NOT NULL THEN
      -- Create free subscription
      INSERT INTO user_subscriptions (
        user_id,
        tier_id,
        status,
        billing_cycle,
        is_recurring,
        period_start_date,
        period_end_date,
        tokens_used_current_period,
        papers_accessed_current_period
      ) VALUES (
        p_user_id,
        v_free_tier_id,
        'active',
        'monthly',
        FALSE,
        NOW(),
        NOW() + INTERVAL '30 days',
        0,
        0
      )
      RETURNING * INTO v_subscription;

      RAISE NOTICE 'Auto-created free tier subscription for user %', p_user_id;
    ELSE
      -- No free tier found, deny access
      RETURN QUERY SELECT FALSE, NULL::TEXT, 'No free tier available'::TEXT, 0, 0;
      RETURN;
    END IF;
  END IF;

  -- Get tier details
  SELECT * INTO v_tier
  FROM subscription_tiers
  WHERE id = v_subscription.tier_id;

  IF v_tier IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Invalid tier'::TEXT, 0, 0;
    RETURN;
  END IF;

  -- Calculate remaining tokens
  IF v_tier.token_limit IS NULL THEN
    v_tokens_remaining := -1; -- Unlimited
  ELSE
    v_tokens_remaining := v_tier.token_limit - v_subscription.tokens_used_current_period;
  END IF;

  -- Calculate remaining papers
  IF v_tier.papers_limit IS NULL THEN
    v_papers_remaining := -1; -- Unlimited
  ELSE
    v_papers_remaining := v_tier.papers_limit - v_subscription.papers_accessed_current_period;
  END IF;

  -- Check access based on feature
  IF p_feature = 'chat' THEN
    IF v_tokens_remaining = -1 OR v_tokens_remaining > 0 THEN
      RETURN QUERY SELECT TRUE, v_tier.name, 'Access granted'::TEXT, v_tokens_remaining, v_papers_remaining;
    ELSE
      RETURN QUERY SELECT FALSE, v_tier.name, 'Token limit exceeded'::TEXT, 0, v_papers_remaining;
    END IF;
  ELSIF p_feature = 'paper_access' THEN
    IF v_papers_remaining = -1 OR v_papers_remaining > 0 THEN
      RETURN QUERY SELECT TRUE, v_tier.name, 'Access granted'::TEXT, v_tokens_remaining, v_papers_remaining;
    ELSE
      RETURN QUERY SELECT FALSE, v_tier.name, 'Paper limit exceeded'::TEXT, v_tokens_remaining, 0;
    END IF;
  ELSE
    RETURN QUERY SELECT TRUE, v_tier.name, 'Access granted'::TEXT, v_tokens_remaining, v_papers_remaining;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
