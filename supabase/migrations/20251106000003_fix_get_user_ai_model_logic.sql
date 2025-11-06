-- Fix get_user_ai_model RPC function logic
-- The previous version had a bug where it would return both the user's preference
-- and the default model due to the OR condition, causing LIMIT 1 to pick the wrong one

DROP FUNCTION IF EXISTS get_user_ai_model(UUID);

CREATE OR REPLACE FUNCTION get_user_ai_model(p_user_id UUID)
RETURNS TABLE (
  model_id UUID,
  provider TEXT,
  model_name TEXT,
  display_name TEXT,
  supports_vision BOOLEAN,
  supports_caching BOOLEAN,
  max_context_tokens INTEGER,
  max_output_tokens INTEGER,
  token_multiplier DECIMAL(4, 2),
  api_endpoint TEXT,
  temperature_default DECIMAL(3, 2)
) AS $$
BEGIN
  -- First, try to get user's preferred model
  RETURN QUERY
  SELECT
    m.id,
    m.provider,
    m.model_name,
    m.display_name,
    m.supports_vision,
    m.supports_caching,
    m.max_context_tokens,
    m.max_output_tokens,
    m.token_multiplier,
    m.api_endpoint,
    m.temperature_default
  FROM profiles p
  INNER JOIN ai_models m ON m.id = p.preferred_ai_model_id
  WHERE p.id = p_user_id
    AND m.is_active = true
  LIMIT 1;

  -- If user has no preference or preference is inactive, return default
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      m.id,
      m.provider,
      m.model_name,
      m.display_name,
      m.supports_vision,
      m.supports_caching,
      m.max_context_tokens,
      m.max_output_tokens,
      m.token_multiplier,
      m.api_endpoint,
      m.temperature_default
    FROM ai_models m
    WHERE m.is_default = true AND m.is_active = true
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_ai_model(UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_user_ai_model(UUID) IS 'Get user''s preferred AI model or default if not set. Returns active models only.';
