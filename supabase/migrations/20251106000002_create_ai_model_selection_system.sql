-- Migration: Create AI Model Selection System
-- Description: Adds support for multiple AI models (Gemini, Claude, OpenAI) with user preferences
-- Date: 2025-11-06

-- =====================================================
-- 1. CREATE AI_MODELS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'claude', 'openai')),
  model_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,

  -- Model capabilities
  supports_vision BOOLEAN DEFAULT true,
  supports_caching BOOLEAN DEFAULT false,
  max_context_tokens INTEGER NOT NULL,
  max_output_tokens INTEGER NOT NULL,

  -- Pricing and token info
  input_token_cost_per_million DECIMAL(10, 4) NOT NULL, -- Cost in USD per 1M input tokens
  output_token_cost_per_million DECIMAL(10, 4) NOT NULL, -- Cost in USD per 1M output tokens
  token_multiplier DECIMAL(4, 2) DEFAULT 1.0, -- Multiplier relative to Gemini (for user display)

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- Metadata
  api_endpoint TEXT,
  temperature_default DECIMAL(3, 2) DEFAULT 0.7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for active models
CREATE INDEX IF NOT EXISTS idx_ai_models_active ON ai_models(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider);

-- Add comment
COMMENT ON TABLE ai_models IS 'Registry of available AI models with their capabilities and pricing information';

-- =====================================================
-- 2. INSERT DEFAULT AI MODELS
-- =====================================================

-- Gemini Models
INSERT INTO ai_models (
  provider, model_name, display_name, description,
  supports_vision, supports_caching,
  max_context_tokens, max_output_tokens,
  input_token_cost_per_million, output_token_cost_per_million,
  token_multiplier, is_active, is_default,
  api_endpoint, temperature_default
) VALUES
(
  'gemini',
  'gemini-2.0-flash',
  'Gemini 2.0 Flash',
  'Fast and efficient model with vision support and built-in caching. Best balance of speed and quality.',
  true,
  true,
  1000000,
  8192,
  0.075,
  0.30,
  1.0,
  true,
  true, -- Default model
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash',
  0.7
),
(
  'gemini',
  'gemini-2.0-flash-exp',
  'Gemini 2.0 Flash (Experimental)',
  'Experimental version with latest features. Used for study plan generation.',
  true,
  true,
  1000000,
  8192,
  0.075,
  0.30,
  1.0,
  true,
  false,
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp',
  0.8
);

-- Claude Models
INSERT INTO ai_models (
  provider, model_name, display_name, description,
  supports_vision, supports_caching,
  max_context_tokens, max_output_tokens,
  input_token_cost_per_million, output_token_cost_per_million,
  token_multiplier, is_active, is_default,
  api_endpoint, temperature_default
) VALUES
(
  'claude',
  'claude-3-5-sonnet-20241022',
  'Claude 3.5 Sonnet',
  'Most intelligent model with superior reasoning. Consumes approximately 2x more tokens than Gemini. Best for complex problem solving.',
  true,
  true,
  200000,
  8192,
  3.00,
  15.00,
  2.0,
  true,
  false,
  'https://api.anthropic.com/v1/messages',
  0.7
),
(
  'claude',
  'claude-3-5-haiku-20241022',
  'Claude 3.5 Haiku',
  'Fast and affordable model. Consumes approximately 1.5x more tokens than Gemini. Good balance of speed and intelligence.',
  true,
  true,
  200000,
  8192,
  1.00,
  5.00,
  1.5,
  true,
  false,
  'https://api.anthropic.com/v1/messages',
  0.7
);

-- OpenAI Models
INSERT INTO ai_models (
  provider, model_name, display_name, description,
  supports_vision, supports_caching,
  max_context_tokens, max_output_tokens,
  input_token_cost_per_million, output_token_cost_per_million,
  token_multiplier, is_active, is_default,
  api_endpoint, temperature_default
) VALUES
(
  'openai',
  'gpt-4o',
  'GPT-4o',
  'OpenAI''s flagship multimodal model. Consumes approximately 2.5x more tokens than Gemini. High quality responses.',
  true,
  false,
  128000,
  16384,
  2.50,
  10.00,
  2.5,
  true,
  false,
  'https://api.openai.com/v1/chat/completions',
  0.7
),
(
  'openai',
  'gpt-4o-mini',
  'GPT-4o Mini',
  'Affordable and fast model with vision support. Consumes approximately 1.8x more tokens than Gemini. Good for most tasks.',
  true,
  false,
  128000,
  16384,
  0.15,
  0.60,
  1.8,
  true,
  false,
  'https://api.openai.com/v1/chat/completions',
  0.7
);

-- =====================================================
-- 3. ADD PREFERRED_AI_MODEL TO PROFILES
-- =====================================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS preferred_ai_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_preferred_ai_model ON profiles(preferred_ai_model_id);

-- Add comment
COMMENT ON COLUMN profiles.preferred_ai_model_id IS 'User''s preferred AI model for chat and study plan generation. NULL means use system default.';

-- =====================================================
-- 4. CREATE FUNCTION TO GET USER'S AI MODEL
-- =====================================================

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
  -- Get user's preferred model, or default if not set
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
  LEFT JOIN profiles p ON p.preferred_ai_model_id = m.id
  WHERE
    (p.id = p_user_id AND m.is_active = true) OR
    (p.id IS NULL AND m.is_default = true AND m.is_active = true)
  LIMIT 1;

  -- If no result, return default model
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
COMMENT ON FUNCTION get_user_ai_model IS 'Returns the AI model configuration for a user (their preference or system default)';

-- =====================================================
-- 5. CREATE RLS POLICIES FOR AI_MODELS
-- =====================================================

ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view active AI models
CREATE POLICY "Authenticated users can view active AI models"
  ON ai_models FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Only admins can manage AI models
CREATE POLICY "Admins can insert AI models"
  ON ai_models FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update AI models"
  ON ai_models FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete AI models"
  ON ai_models FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =====================================================
-- 6. CREATE UPDATED_AT TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION update_ai_models_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_models_updated_at
  BEFORE UPDATE ON ai_models
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_models_updated_at();

-- =====================================================
-- 7. UPDATE TOKEN_USAGE_LOGS TO TRACK MODEL
-- =====================================================

-- Add model_id foreign key to token_usage_logs if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'token_usage_logs') THEN
    ALTER TABLE token_usage_logs
    ADD COLUMN IF NOT EXISTS ai_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_token_usage_logs_ai_model ON token_usage_logs(ai_model_id);

    COMMENT ON COLUMN token_usage_logs.ai_model_id IS 'Reference to the AI model used for this request';
  END IF;
END $$;
