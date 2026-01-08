-- Migration: Add Gemini 2.5 Pro Model
-- Description: Adds Gemini 2.5 Pro as an available AI model for subscription tiers
-- Date: 2026-01-08
--
-- Gemini 2.5 Pro Official Pricing (as of Jan 2026):
-- For prompts <= 200k tokens:
--   - Input:  $1.25 per 1M tokens
--   - Output: $10.00 per 1M tokens (includes thinking tokens)
--   - Context caching: $0.125 per 1M tokens
-- For prompts > 200k tokens:
--   - Input:  $2.50 per 1M tokens
--   - Output: $15.00 per 1M tokens
--   - Context caching: $0.25 per 1M tokens
--
-- Note: Most chat conversations are under 200k tokens, so we use the lower tier pricing
--
-- Cost Calculation (compared to Gemini 2.0 Flash baseline):
-- Gemini 2.0 Flash: $0.075 input, $0.30 output
-- Gemini 2.5 Pro:   $1.25 input, $10.00 output (using <= 200k pricing)
--
-- Using weighted average (70% input, 30% output for typical chat):
-- - Gemini 2.0 Flash: (0.075 * 0.7) + (0.30 * 0.3) = $0.1425 per 1M tokens
-- - Gemini 2.5 Pro:   (1.25 * 0.7) + (10.00 * 0.3) = $3.875 per 1M tokens
-- - Token Multiplier: 3.875 / 0.1425 ≈ 27.19x
--
-- This means users on Gemini 2.5 Pro will consume approximately 27x more
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
  'Advanced reasoning model with superior problem-solving capabilities. Consumes approximately 27x more tokens than Gemini 2.0 Flash. Best for complex mathematical and analytical tasks.',
  true,  -- supports_vision
  true,  -- supports_caching (Gemini models support context caching at $0.125 per 1M tokens)
  2000000,  -- max_context_tokens (2M tokens)
  8192,  -- max_output_tokens
  1.25,  -- input_token_cost_per_million ($1.25 per 1M input tokens for <= 200k prompts)
  10.00,  -- output_token_cost_per_million ($10.00 per 1M output tokens for <= 200k prompts)
  27.0,  -- token_multiplier (approximately 27x more expensive than Gemini 2.0 Flash)
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
--   (1000 / 1000000) * $1.25 + (500 / 1000000) * $10.00 = $0.00625
--
-- Cost ratio: $0.00625 / $0.000225 = 27.78x
-- Tokens to deduct: 1500 * 27.78 = 41,670 tokens
--
-- This ensures platform costs remain predictable regardless of which
-- model users select, as the token deduction scales with actual cost.
--
-- Note: For prompts > 200k tokens, costs double ($2.50 input, $15.00 output),
-- resulting in even higher token deductions. This is automatically handled
-- by the cost-based calculation function.

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
