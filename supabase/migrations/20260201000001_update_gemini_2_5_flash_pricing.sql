-- Migration: Update Gemini 2.5 Flash Pricing to Official Rates
-- Description: Corrects Gemini 2.5 Flash pricing to match Google's official rates
-- Date: 2026-02-01
--
-- Issue: Analytics showing ~$1 when actual bill is ~$8 due to incorrect pricing
-- Official Pricing: https://ai.google.dev/pricing
-- - Input: $0.30 per 1M tokens (was $0.075 - 4x too low)
-- - Output: $2.50 per 1M tokens (was $0.30 - 8.3x too low)

-- Update Gemini 2.5 Flash pricing to official rates
UPDATE ai_models
SET
  input_token_cost_per_million = 0.30,
  output_token_cost_per_million = 2.50,
  description = 'Latest Gemini model with improved performance, vision support, and built-in caching. Best balance of speed, quality, and cost. Official pricing: $0.30/1M input tokens, $2.50/1M output tokens.'
WHERE model_name = 'gemini-2.5-flash';

-- Verify the update
DO $$
DECLARE
  updated_input DECIMAL;
  updated_output DECIMAL;
BEGIN
  SELECT input_token_cost_per_million, output_token_cost_per_million
  INTO updated_input, updated_output
  FROM ai_models
  WHERE model_name = 'gemini-2.5-flash';

  IF updated_input != 0.30 OR updated_output != 2.50 THEN
    RAISE EXCEPTION 'Pricing update failed! Expected input=0.30, output=2.50, got input=%, output=%', updated_input, updated_output;
  END IF;

  RAISE NOTICE 'Gemini 2.5 Flash pricing updated successfully: Input=$%.2f/1M, Output=$%.2f/1M', updated_input, updated_output;
END $$;
