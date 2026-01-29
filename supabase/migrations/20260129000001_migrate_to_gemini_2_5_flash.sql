-- Migration: Migrate to Gemini 2.5 Flash
-- Description: Adds Gemini 2.5 Flash and deprecates Gemini 2.0 models (discontinued by Google)
-- Date: 2026-01-29

-- =====================================================
-- 1. UNSET EXISTING DEFAULT MODELS
-- =====================================================

-- First, unset is_default on all existing models to avoid conflicts
UPDATE ai_models
SET is_default = false
WHERE is_default = true;

-- =====================================================
-- 2. ADD OR UPDATE GEMINI 2.5 FLASH
-- =====================================================

-- Use INSERT ... ON CONFLICT to handle case where model already exists
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
  'gemini-2.5-flash',
  'Gemini 2.5 Flash',
  'Latest Gemini model with improved performance, vision support, and built-in caching. Best balance of speed, quality, and cost.',
  true, -- supports_vision
  true, -- supports_caching
  1000000, -- max_context_tokens
  8192, -- max_output_tokens
  0.075, -- input_token_cost_per_million
  0.30, -- output_token_cost_per_million
  1.0, -- token_multiplier (baseline)
  true, -- is_active
  true, -- is_default (new default)
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash',
  0.7 -- temperature_default
)
ON CONFLICT (model_name)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  supports_vision = EXCLUDED.supports_vision,
  supports_caching = EXCLUDED.supports_caching,
  max_context_tokens = EXCLUDED.max_context_tokens,
  max_output_tokens = EXCLUDED.max_output_tokens,
  input_token_cost_per_million = EXCLUDED.input_token_cost_per_million,
  output_token_cost_per_million = EXCLUDED.output_token_cost_per_million,
  token_multiplier = EXCLUDED.token_multiplier,
  is_active = EXCLUDED.is_active,
  is_default = EXCLUDED.is_default,
  api_endpoint = EXCLUDED.api_endpoint,
  temperature_default = EXCLUDED.temperature_default;

-- =====================================================
-- 3. DEPRECATE GEMINI 2.0 MODELS
-- =====================================================

-- Mark Gemini 2.0 Flash as inactive (discontinued by Google)
UPDATE ai_models
SET
  is_active = false,
  is_default = false,
  description = '[DEPRECATED] ' || description || ' This model has been discontinued by Google. Please use Gemini 2.5 Flash instead.'
WHERE model_name = 'gemini-2.0-flash';

-- Mark Gemini 2.0 Flash Experimental as inactive
UPDATE ai_models
SET
  is_active = false,
  is_default = false,
  description = '[DEPRECATED] ' || description || ' This model has been discontinued by Google. Please use Gemini 2.5 Flash instead.'
WHERE model_name = 'gemini-2.0-flash-exp';

-- =====================================================
-- 4. MIGRATE EXISTING USER PREFERENCES
-- =====================================================

-- Migrate users who had Gemini 2.0 Flash as their preference to Gemini 2.5 Flash
UPDATE profiles
SET preferred_ai_model_id = (
  SELECT id FROM ai_models WHERE model_name = 'gemini-2.5-flash'
)
WHERE preferred_ai_model_id IN (
  SELECT id FROM ai_models WHERE model_name IN ('gemini-2.0-flash', 'gemini-2.0-flash-exp')
);

-- =====================================================
-- 5. MIGRATE SUBSCRIPTION TIER AI MODELS
-- =====================================================

-- Migrate subscription tiers that were using Gemini 2.0 models to Gemini 2.5 Flash
UPDATE subscription_tiers
SET ai_model_id = (
  SELECT id FROM ai_models WHERE model_name = 'gemini-2.5-flash'
)
WHERE ai_model_id IN (
  SELECT id FROM ai_models WHERE model_name IN ('gemini-2.0-flash', 'gemini-2.0-flash-exp')
);

-- =====================================================
-- 6. MIGRATE SUBJECT-SPECIFIC AI MODELS
-- =====================================================

-- Migrate subjects that were using Gemini 2.0 models to Gemini 2.5 Flash
UPDATE subjects
SET ai_model_id = (
  SELECT id FROM ai_models WHERE model_name = 'gemini-2.5-flash'
)
WHERE ai_model_id IN (
  SELECT id FROM ai_models WHERE model_name IN ('gemini-2.0-flash', 'gemini-2.0-flash-exp')
);

-- =====================================================
-- 7. ENSURE ONLY GEMINI 2.5 FLASH IS DEFAULT
-- =====================================================

-- Final safety check: Unset is_default on all models except gemini-2.5-flash
UPDATE ai_models
SET is_default = false
WHERE model_name != 'gemini-2.5-flash' AND is_default = true;

-- Ensure gemini-2.5-flash is set as default
UPDATE ai_models
SET is_default = true
WHERE model_name = 'gemini-2.5-flash';

-- =====================================================
-- 8. VERIFY DEFAULT AI MODEL
-- =====================================================

-- Verify default model is set correctly
DO $$
DECLARE
  default_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO default_count
  FROM ai_models
  WHERE is_default = true AND is_active = true;

  IF default_count = 0 THEN
    RAISE EXCEPTION 'No default AI model found after migration!';
  ELSIF default_count > 1 THEN
    RAISE EXCEPTION 'Multiple default AI models found after migration!';
  END IF;

  RAISE NOTICE 'Migration successful: Gemini 2.5 Flash is now the default model';
END $$;
