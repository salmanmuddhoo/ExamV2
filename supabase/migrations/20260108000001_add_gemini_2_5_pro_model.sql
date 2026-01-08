-- Migration: Add Gemini 2.5 Pro Model
-- Description: Adds Gemini 2.5 Pro as an available AI model for subscription tiers
-- Date: 2026-01-08
--
-- Gemini 2.5 Pro Pricing (as of Jan 2026):
-- - Input:  $1.25 per 1M tokens
-- - Output: $5.00 per 1M tokens
--
-- Cost Calculation (compared to Gemini 2.0 Flash baseline):
-- Gemini 2.0 Flash: $0.075 input, $0.30 output
-- Gemini 2.5 Pro:   $1.25 input, $5.00 output
--
-- Using weighted average (70% input, 30% output for typical chat):
-- - Gemini 2.0 Flash: (0.075 * 0.7) + (0.30 * 0.3) = $0.1425 per 1M tokens
-- - Gemini 2.5 Pro:   (1.25 * 0.7) + (5.00 * 0.3) = $2.375 per 1M tokens
-- - Token Multiplier: 2.375 / 0.1425 ≈ 16.67x
--
-- This means users on Gemini 2.5 Pro will consume approximately 16-17x more
-- tokens from their allocation compared to Gemini 2.0 Flash users.

-- =====================================================
-- 1. INSERT GEMINI 2.5 PRO MODEL
-- =====================================================

INSERT INTO ai_models (
  provider,
  model_name,
  display_name,
  description,
  supports_vision,
  supports_caching,
  max_context_tokens,
  max_output_tokens,
  input_token_cost_per_million,
  output_token_cost_per_million,
  token_multiplier,
  is_active,
  is_default,
  api_endpoint,
  temperature_default
) VALUES (
  'gemini',
  'gemini-2.5-pro',
  'Gemini 2.5 Pro',
  'Advanced reasoning model with superior problem-solving capabilities. Consumes approximately 16-17x more tokens than Gemini 2.0 Flash. Best for complex mathematical and analytical tasks.',
  true,  -- supports_vision
  true,  -- supports_caching (Gemini models support context caching)
  2000000,  -- max_context_tokens (2M tokens)
  8192,  -- max_output_tokens
  1.25,  -- input_token_cost_per_million ($1.25 per 1M input tokens)
  5.00,  -- output_token_cost_per_million ($5.00 per 1M output tokens)
  16.7,  -- token_multiplier (approximately 16.67x more expensive than Gemini 2.0 Flash)
  true,  -- is_active (available for selection)
  false, -- is_default (not the default model)
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro',
  0.7    -- temperature_default
)
ON CONFLICT (model_name) DO UPDATE SET
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
  api_endpoint = EXCLUDED.api_endpoint,
  temperature_default = EXCLUDED.temperature_default,
  updated_at = NOW();

-- =====================================================
-- 2. VERIFY TOKEN CONSUMPTION CALCULATION
-- =====================================================

-- The existing calculate_cost_based_token_consumption() function
-- will automatically handle Gemini 2.5 Pro's higher costs.
--
-- Example calculation for 1000 input + 500 output tokens:
--
-- Gemini 2.0 Flash cost:
--   (1000 / 1000000) * $0.075 + (500 / 1000000) * $0.30 = $0.000225
--
-- Gemini 2.5 Pro cost:
--   (1000 / 1000000) * $1.25 + (500 / 1000000) * $5.00 = $0.00375
--
-- Cost ratio: $0.00375 / $0.000225 = 16.67x
-- Tokens to deduct: 1500 * 16.67 = 25,005 tokens
--
-- This ensures platform costs remain predictable regardless of which
-- model users select, as the token deduction scales with actual cost.

-- =====================================================
-- 3. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE ai_models IS 'Registry of available AI models with their capabilities and pricing information. Gemini 2.5 Pro added on 2026-01-08 for advanced reasoning tasks.';

-- =====================================================
-- 4. VERIFY MIGRATION SUCCESS
-- =====================================================

-- Query to verify Gemini 2.5 Pro was added:
-- SELECT
--   display_name,
--   provider,
--   input_token_cost_per_million as input_cost,
--   output_token_cost_per_million as output_cost,
--   token_multiplier,
--   is_active
-- FROM ai_models
-- WHERE model_name = 'gemini-2.5-pro';
