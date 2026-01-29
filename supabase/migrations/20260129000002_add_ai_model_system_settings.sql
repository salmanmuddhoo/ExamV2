-- Migration: Add AI Model System Settings
-- Description: Adds system-wide configuration for AI models used in exam upload and study plan generation
-- Date: 2026-01-29

-- =====================================================
-- ADD NEW SYSTEM SETTINGS FOR AI MODEL SELECTION
-- =====================================================

-- Get the ID of Gemini 2.5 Flash (the new default)
DO $$
DECLARE
  gemini_25_id UUID;
BEGIN
  SELECT id INTO gemini_25_id
  FROM ai_models
  WHERE model_name = 'gemini-2.5-flash-latest'
  AND is_active = true
  LIMIT 1;

  -- Insert settings for exam upload AI model
  INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  (
    'exam_upload_ai_model_id',
    jsonb_build_object('model_id', gemini_25_id),
    'AI model used for processing exam paper uploads (question extraction, chapter tagging, marking scheme extraction)'
  )
  ON CONFLICT (setting_key) DO UPDATE
  SET setting_value = jsonb_build_object('model_id', gemini_25_id),
      description = 'AI model used for processing exam paper uploads (question extraction, chapter tagging, marking scheme extraction)',
      updated_at = NOW();

  -- Insert settings for study plan AI model
  INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  (
    'study_plan_ai_model_id',
    jsonb_build_object('model_id', gemini_25_id),
    'AI model used for generating personalized study plans'
  )
  ON CONFLICT (setting_key) DO UPDATE
  SET setting_value = jsonb_build_object('model_id', gemini_25_id),
      description = 'AI model used for generating personalized study plans',
      updated_at = NOW();

  -- Update old gemini_model setting to use new format (for backward compatibility)
  UPDATE system_settings
  SET
    setting_value = jsonb_build_object('model_id', gemini_25_id),
    description = '[DEPRECATED] Use exam_upload_ai_model_id instead. AI model for exam processing.',
    updated_at = NOW()
  WHERE setting_key = 'gemini_model';

  RAISE NOTICE 'AI model system settings created with Gemini 2.5 Flash as default';
END $$;

-- =====================================================
-- CREATE HELPER FUNCTION TO GET AI MODEL FOR SPECIFIC PURPOSE
-- =====================================================

CREATE OR REPLACE FUNCTION get_system_ai_model(p_purpose TEXT)
RETURNS TABLE (
  model_id UUID,
  provider TEXT,
  model_name TEXT,
  display_name TEXT,
  api_endpoint TEXT,
  supports_vision BOOLEAN,
  supports_caching BOOLEAN,
  max_context_tokens INTEGER,
  max_output_tokens INTEGER,
  temperature_default DECIMAL(3, 2),
  input_token_cost_per_million DECIMAL(10, 4),
  output_token_cost_per_million DECIMAL(10, 4)
) AS $$
DECLARE
  setting_key TEXT;
  model_uuid UUID;
BEGIN
  -- Determine which setting to look up based on purpose
  CASE p_purpose
    WHEN 'exam_upload' THEN
      setting_key := 'exam_upload_ai_model_id';
    WHEN 'study_plan' THEN
      setting_key := 'study_plan_ai_model_id';
    ELSE
      RAISE EXCEPTION 'Invalid purpose: %. Must be exam_upload or study_plan', p_purpose;
  END CASE;

  -- Get the model_id from system settings
  SELECT (setting_value->>'model_id')::UUID INTO model_uuid
  FROM system_settings
  WHERE system_settings.setting_key = setting_key;

  -- If no setting found, use default model
  IF model_uuid IS NULL THEN
    SELECT id INTO model_uuid
    FROM ai_models
    WHERE is_default = true AND is_active = true
    LIMIT 1;
  END IF;

  -- Return the model details
  RETURN QUERY
  SELECT
    m.id,
    m.provider,
    m.model_name,
    m.display_name,
    m.api_endpoint,
    m.supports_vision,
    m.supports_caching,
    m.max_context_tokens,
    m.max_output_tokens,
    m.temperature_default,
    m.input_token_cost_per_million,
    m.output_token_cost_per_million
  FROM ai_models m
  WHERE m.id = model_uuid AND m.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_system_ai_model(TEXT) TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION get_system_ai_model IS 'Returns the AI model configuration for a specific system purpose (exam_upload or study_plan)';
