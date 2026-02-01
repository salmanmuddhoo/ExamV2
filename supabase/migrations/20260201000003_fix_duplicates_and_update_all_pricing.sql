-- Migration: Fix Duplicate Models and Update All AI Model Pricing
-- Description: Removes duplicate Gemini 2.5 Flash entries and updates all model pricing to latest official rates
-- Date: 2026-02-01

-- =====================================================
-- 1. REMOVE DUPLICATE GEMINI 2.5 FLASH MODELS
-- =====================================================

-- Keep only the most recent Gemini 2.5 Flash entry and delete duplicates
DO $$
DECLARE
  keeper_id UUID;
  duplicate_count INTEGER;
BEGIN
  -- Find the ID of the record to keep (most recently updated)
  SELECT id INTO keeper_id
  FROM ai_models
  WHERE model_name = 'gemini-2.5-flash'
  ORDER BY updated_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF keeper_id IS NOT NULL THEN
    -- Count duplicates before deletion
    SELECT COUNT(*) - 1 INTO duplicate_count
    FROM ai_models
    WHERE model_name = 'gemini-2.5-flash';

    -- Delete all other entries with the same model_name
    DELETE FROM ai_models
    WHERE model_name = 'gemini-2.5-flash'
      AND id != keeper_id;

    RAISE NOTICE 'Removed % duplicate Gemini 2.5 Flash model(s)', duplicate_count;
  END IF;
END $$;

-- =====================================================
-- 2. UPDATE ALL AI MODEL PRICING TO CURRENT RATES
-- =====================================================

-- Gemini 2.5 Flash (if not already correct)
UPDATE ai_models
SET
  input_token_cost_per_million = 0.30,
  output_token_cost_per_million = 2.50,
  display_name = 'Gemini 2.5 Flash',
  description = 'Latest Gemini model with improved performance, vision support, and built-in caching. Best balance of speed, quality, and cost. Official pricing: $0.30/1M input tokens, $2.50/1M output tokens.',
  token_multiplier = 1.0,
  is_active = true,
  supports_vision = true,
  supports_caching = true,
  updated_at = NOW()
WHERE model_name = 'gemini-2.5-flash';

-- Claude 3.5 Sonnet (Latest pricing as of Feb 2026)
-- https://www.anthropic.com/pricing
UPDATE ai_models
SET
  input_token_cost_per_million = 3.00,
  output_token_cost_per_million = 15.00,
  token_multiplier = 10.0,
  description = 'Most intelligent Claude model with superior reasoning. Input: $3/1M tokens, Output: $15/1M tokens. Best for complex problem solving.',
  updated_at = NOW()
WHERE model_name = 'claude-3-5-sonnet-20241022';

-- Claude 3.5 Haiku (Latest pricing)
UPDATE ai_models
SET
  input_token_cost_per_million = 1.00,
  output_token_cost_per_million = 5.00,
  token_multiplier = 3.3,
  description = 'Fast and affordable Claude model. Input: $1/1M tokens, Output: $5/1M tokens. Good balance of speed and intelligence.',
  updated_at = NOW()
WHERE model_name = 'claude-3-5-haiku-20241022';

-- GPT-4o (Latest OpenAI pricing)
-- https://openai.com/api/pricing/
UPDATE ai_models
SET
  input_token_cost_per_million = 2.50,
  output_token_cost_per_million = 10.00,
  token_multiplier = 6.7,
  description = 'OpenAI flagship multimodal model. Input: $2.50/1M tokens, Output: $10/1M tokens. High quality responses with vision support.',
  updated_at = NOW()
WHERE model_name = 'gpt-4o';

-- GPT-4o Mini (Latest OpenAI pricing)
UPDATE ai_models
SET
  input_token_cost_per_million = 0.15,
  output_token_cost_per_million = 0.60,
  token_multiplier = 0.5,
  description = 'Affordable and fast OpenAI model with vision support. Input: $0.15/1M tokens, Output: $0.60/1M tokens. Good for most tasks.',
  updated_at = NOW()
WHERE model_name = 'gpt-4o-mini';

-- O1 Preview (OpenAI reasoning model)
UPDATE ai_models
SET
  input_token_cost_per_million = 15.00,
  output_token_cost_per_million = 60.00,
  token_multiplier = 50.0,
  description = 'OpenAI advanced reasoning model. Input: $15/1M tokens, Output: $60/1M tokens. Best for complex reasoning tasks.',
  updated_at = NOW()
WHERE model_name = 'o1-preview';

-- O1 Mini (OpenAI reasoning model)
UPDATE ai_models
SET
  input_token_cost_per_million = 3.00,
  output_token_cost_per_million = 12.00,
  token_multiplier = 10.0,
  description = 'Fast OpenAI reasoning model. Input: $3/1M tokens, Output: $12/1M tokens. Efficient reasoning at lower cost.',
  updated_at = NOW()
WHERE model_name = 'o1-mini';

-- =====================================================
-- 3. ENSURE ONLY ONE DEFAULT MODEL
-- =====================================================

-- Unset all defaults first
UPDATE ai_models SET is_default = false WHERE is_default = true;

-- Set Gemini 2.5 Flash as default
UPDATE ai_models
SET is_default = true
WHERE model_name = 'gemini-2.5-flash';

-- =====================================================
-- 4. UPDATE ADMIN UPLOAD MODEL IF IT'S USING OLD MODEL
-- =====================================================

-- Update admin_upload_model setting to use Gemini 2.5 Flash if it's using old models
UPDATE system_settings
SET setting_value = (
  SELECT id::text FROM ai_models WHERE model_name = 'gemini-2.5-flash' LIMIT 1
)
WHERE setting_key = 'admin_upload_model'
  AND setting_value IN (
    SELECT id::text FROM ai_models WHERE model_name IN ('gemini-2.0-flash', 'gemini-2.0-flash-exp')
  );

-- =====================================================
-- 5. VERIFICATION
-- =====================================================

DO $$
DECLARE
  gemini_count INTEGER;
  default_count INTEGER;
  gemini_price_input DECIMAL;
  gemini_price_output DECIMAL;
BEGIN
  -- Check for duplicates
  SELECT COUNT(*) INTO gemini_count
  FROM ai_models
  WHERE model_name = 'gemini-2.5-flash';

  IF gemini_count > 1 THEN
    RAISE EXCEPTION 'Still have % duplicate Gemini 2.5 Flash models!', gemini_count;
  ELSIF gemini_count = 0 THEN
    RAISE EXCEPTION 'No Gemini 2.5 Flash model found!';
  END IF;

  -- Check default model
  SELECT COUNT(*) INTO default_count
  FROM ai_models
  WHERE is_default = true AND is_active = true;

  IF default_count != 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 default model, found %', default_count;
  END IF;

  -- Verify Gemini pricing
  SELECT input_token_cost_per_million, output_token_cost_per_million
  INTO gemini_price_input, gemini_price_output
  FROM ai_models
  WHERE model_name = 'gemini-2.5-flash';

  IF gemini_price_input != 0.30 OR gemini_price_output != 2.50 THEN
    RAISE EXCEPTION 'Gemini 2.5 Flash pricing incorrect: input=%, output=%', gemini_price_input, gemini_price_output;
  END IF;

  RAISE NOTICE '✅ Migration successful: No duplicates, pricing updated, Gemini 2.5 Flash is default';
  RAISE NOTICE '   Gemini 2.5 Flash: Input=$0.30/1M, Output=$2.50/1M';
END $$;

-- =====================================================
-- 6. SHOW UPDATED PRICING SUMMARY
-- =====================================================

DO $$
DECLARE
  model_record RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== AI Model Pricing Summary ===';
  FOR model_record IN
    SELECT
      display_name,
      input_token_cost_per_million,
      output_token_cost_per_million,
      token_multiplier,
      is_default
    FROM ai_models
    WHERE is_active = true
    ORDER BY token_multiplier ASC
  LOOP
    RAISE NOTICE '% %: Input=$%/1M, Output=$%/1M (%.1fx multiplier)',
      CASE WHEN model_record.is_default THEN '⭐' ELSE '  ' END,
      model_record.display_name,
      model_record.input_token_cost_per_million,
      model_record.output_token_cost_per_million,
      model_record.token_multiplier;
  END LOOP;
  RAISE NOTICE '';
END $$;
