-- Create system_settings table for application-wide configuration
-- This includes the AI cache mode toggle and other settings

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);

-- Add RLS policies
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write system settings
CREATE POLICY "Admins can read system settings"
  ON system_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update system settings"
  ON system_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert system settings"
  ON system_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Insert default settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('ai_cache_mode', '{"useGeminiCache": false}'::jsonb, 'AI caching mode: true = Gemini built-in cache, false = own database cache'),
  ('gemini_model', '{"model": "gemini-2.0-flash-exp"}'::jsonb, 'Gemini model to use for AI assistant')
ON CONFLICT (setting_key) DO NOTHING;

-- Create helper function to get setting value
CREATE OR REPLACE FUNCTION get_system_setting(p_setting_key TEXT)
RETURNS JSONB AS $$
DECLARE
  v_value JSONB;
BEGIN
  SELECT setting_value INTO v_value
  FROM system_settings
  WHERE setting_key = p_setting_key;

  RETURN v_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to update setting value
CREATE OR REPLACE FUNCTION update_system_setting(
  p_setting_key TEXT,
  p_setting_value JSONB,
  p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE system_settings
  SET
    setting_value = p_setting_value,
    updated_by = COALESCE(p_user_id, auth.uid()),
    updated_at = NOW()
  WHERE setting_key = p_setting_key;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_system_setting(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_system_setting(TEXT, JSONB, UUID) TO authenticated;

-- Comments
COMMENT ON TABLE system_settings IS 'Application-wide configuration settings including AI cache mode toggle';
COMMENT ON COLUMN system_settings.setting_key IS 'Unique identifier for the setting';
COMMENT ON COLUMN system_settings.setting_value IS 'JSONB value allowing flexible setting structures';
COMMENT ON FUNCTION get_system_setting(TEXT) IS 'Get a system setting value by key. Returns JSONB.';
COMMENT ON FUNCTION update_system_setting(TEXT, JSONB, UUID) IS 'Update a system setting value. Admins only.';
