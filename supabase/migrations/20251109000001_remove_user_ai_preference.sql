-- Remove user personal AI preference from get_user_ai_model function
-- Now users ONLY get the AI model configured for their subscription tier
-- No more personal preferences - admin configures tier model

DROP FUNCTION IF EXISTS get_user_ai_model(UUID);

CREATE OR REPLACE FUNCTION get_user_ai_model(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  provider TEXT,
  model_name TEXT,
  display_name TEXT,
  api_endpoint TEXT,
  temperature_default NUMERIC,
  max_output_tokens INTEGER,
  supports_vision BOOLEAN,
  supports_caching BOOLEAN,
  is_default BOOLEAN,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Priority 1: Subscription tier's AI model
  -- This is what the admin configures for each tier
  RETURN QUERY
  SELECT m.id, m.provider, m.model_name, m.display_name, m.api_endpoint,
         m.temperature_default, m.max_output_tokens, m.supports_vision, m.supports_caching,
         m.is_default, m.is_active, m.created_at
  FROM user_subscriptions us
  INNER JOIN subscription_tiers st ON st.id = us.tier_id
  INNER JOIN ai_models m ON m.id = st.ai_model_id
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
    AND m.is_active = true
  ORDER BY us.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Priority 2: System default model (fallback if no tier or tier has no AI model configured)
  RETURN QUERY
  SELECT m.id, m.provider, m.model_name, m.display_name, m.api_endpoint,
         m.temperature_default, m.max_output_tokens, m.supports_vision, m.supports_caching,
         m.is_default, m.is_active, m.created_at
  FROM ai_models m
  WHERE m.is_default = true
    AND m.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_ai_model IS 'Returns the AI model for a user by checking: 1) Subscription tier model (admin configured), 2) System default. User personal preferences are no longer supported.';
