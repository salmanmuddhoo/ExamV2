-- Add Gemini cache API key setting for separate billing and tracking
-- This allows using different API keys for different cache modes

-- Insert Gemini cache API key setting
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  (
    'gemini_cache_api_key',
    '{"apiKey": ""}'::jsonb,
    'Gemini API key for built-in cache mode. Leave empty to use environment variable GEMINI_CACHE_API_KEY.'
  )
ON CONFLICT (setting_key) DO NOTHING;

-- Comment
COMMENT ON TABLE system_settings IS 'Application-wide configuration settings including AI cache mode toggle and API keys';

-- Helper function to get Gemini cache API key
CREATE OR REPLACE FUNCTION get_gemini_cache_api_key()
RETURNS TEXT AS $$
DECLARE
  v_api_key TEXT;
BEGIN
  -- Try to get from database settings first
  SELECT (setting_value->>'apiKey') INTO v_api_key
  FROM system_settings
  WHERE setting_key = 'gemini_cache_api_key'
  AND setting_value->>'apiKey' IS NOT NULL
  AND setting_value->>'apiKey' != '';

  RETURN v_api_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_gemini_cache_api_key() TO service_role;

COMMENT ON FUNCTION get_gemini_cache_api_key() IS 'Get Gemini cache API key from settings. Returns null if not set (will use environment variable).';
