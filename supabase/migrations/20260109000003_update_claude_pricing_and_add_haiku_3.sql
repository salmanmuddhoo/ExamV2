-- Migration: Update Claude Model Pricing and Add Claude Haiku 3
-- Description: Updates pricing for existing Claude models based on official 2026 pricing
--              and adds Claude Haiku 3 as a new model option
-- Date: 2026-01-09
--
-- Official Claude Pricing (as of Jan 2026):
-- - Claude Haiku 3.5: $0.80/MTok input, $4.00/MTok output
-- - Claude Haiku 4.5: $1.00/MTok input, $5.00/MTok output (already correct)
-- - Claude Sonnet 3.5: $3.00/MTok input, $15.00/MTok output (already correct)
-- - Claude Haiku 3: $0.25/MTok input, $1.25/MTok output (NEW)
--
-- Cost Calculation (compared to Gemini 2.0 Flash baseline):
-- Gemini 2.0 Flash baseline: $0.075 input, $0.30 output
-- Weighted average (70% input, 30% output): (0.075 * 0.7) + (0.30 * 0.3) = $0.1425 per 1M tokens
--
-- Claude Haiku 3.5 (updated):
-- - Cost: (0.80 * 0.7) + (4.00 * 0.3) = $1.76 per 1M tokens
-- - Token Multiplier: 1.76 / 0.1425 ≈ 12.35x
--
-- Claude Haiku 3 (new):
-- - Cost: (0.25 * 0.7) + (1.25 * 0.3) = $0.55 per 1M tokens
-- - Token Multiplier: 0.55 / 0.1425 ≈ 3.86x

-- =====================================================
-- 1. UPDATE CLAUDE 3.5 HAIKU PRICING
-- =====================================================

UPDATE ai_models
SET
  input_token_cost_per_million = 0.80,
  output_token_cost_per_million = 4.00,
  token_multiplier = 12.35,
  description = 'Fast and affordable model. Consumes approximately 12x more tokens than Gemini. Good balance of speed and intelligence.',
  updated_at = NOW()
WHERE model_name = 'claude-3-5-haiku-20241022';

-- =====================================================
-- 2. INSERT CLAUDE HAIKU 3 MODEL
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
  'claude',
  'claude-3-haiku-20240307',
  'Claude Haiku 3',
  'Most affordable Claude model. Consumes approximately 4x more tokens than Gemini. Excellent for simple tasks and high-volume processing.',
  true,  -- supports_vision
  true,  -- supports_caching (Claude models support prompt caching)
  200000,  -- max_context_tokens (200k tokens)
  4096,  -- max_output_tokens
  0.25,  -- input_token_cost_per_million ($0.25 per 1M input tokens)
  1.25,  -- output_token_cost_per_million ($1.25 per 1M output tokens)
  3.86,  -- token_multiplier (approximately 3.86x more expensive than Gemini 2.0 Flash)
  true,  -- is_active (available for selection)
  false, -- is_default (not the default model)
  'https://api.anthropic.com/v1/messages',
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
-- 3. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE ai_models IS 'Registry of available AI models with their capabilities and pricing information. Updated Claude pricing and added Claude Haiku 3 on 2026-01-09.';

-- =====================================================
-- 4. VERIFY MIGRATION SUCCESS
-- =====================================================

-- Query to verify all Claude models and their pricing:
-- SELECT
--   display_name,
--   model_name,
--   input_token_cost_per_million as input_cost,
--   output_token_cost_per_million as output_cost,
--   token_multiplier,
--   is_active
-- FROM ai_models
-- WHERE provider = 'claude'
-- ORDER BY token_multiplier ASC;

-- =====================================================
-- 5. USAGE NOTES
-- =====================================================

-- Claude Haiku 3 can be assigned to any subscription tier by admins.
-- To assign to a tier, update the subscription_tiers table:
--
-- UPDATE subscription_tiers
-- SET ai_model_id = (
--   SELECT id FROM ai_models
--   WHERE model_name = 'claude-3-haiku-20240307'
-- )
-- WHERE name = 'student';  -- or 'free', 'student_lite', 'pro'
--
-- The model will also be available for users to select as their
-- preferred model in their profile settings (if they have permission).
