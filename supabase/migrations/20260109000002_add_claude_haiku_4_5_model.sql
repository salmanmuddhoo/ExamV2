-- Migration: Add Claude Haiku 4.5 Model
-- Description: Adds Claude Haiku 4.5 as an available AI model for subscription tiers
-- Date: 2026-01-09
--
-- Claude Haiku 4.5 Official Pricing (as of Jan 2026):
-- - Input:  $1.00 per 1M tokens
-- - Output: $5.00 per 1M tokens
-- - Supports prompt caching at reduced rates
--
-- Cost Calculation (compared to Gemini 2.0 Flash baseline):
-- Gemini 2.0 Flash: $0.075 input, $0.30 output
-- Claude Haiku 4.5:  $1.00 input, $5.00 output
--
-- Using weighted average (70% input, 30% output for typical chat):
-- - Gemini 2.0 Flash: (0.075 * 0.7) + (0.30 * 0.3) = $0.1425 per 1M tokens
-- - Claude Haiku 4.5:  (1.00 * 0.7) + (5.00 * 0.3) = $2.20 per 1M tokens
-- - Token Multiplier: 2.20 / 0.1425 ≈ 15.44x (rounded to 15.5x)
--
-- This means users on Claude Haiku 4.5 will consume approximately 15.5x more
-- tokens from their allocation compared to Gemini 2.0 Flash users.

-- =====================================================
-- 1. INSERT CLAUDE HAIKU 4.5 MODEL
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
  'claude-haiku-4-5-20251001',
  'Claude Haiku 4.5',
  'Newest fast and intelligent Claude model. Excellent balance of speed and reasoning capabilities. Consumes approximately 15.5x more tokens than Gemini 2.0 Flash. Great for complex problem solving and detailed explanations.',
  true,  -- supports_vision
  true,  -- supports_caching (Claude models support prompt caching)
  200000,  -- max_context_tokens (200k tokens)
  8192,  -- max_output_tokens
  1.00,  -- input_token_cost_per_million ($1.00 per 1M input tokens)
  5.00,  -- output_token_cost_per_million ($5.00 per 1M output tokens)
  15.5,  -- token_multiplier (approximately 15.5x more expensive than Gemini 2.0 Flash)
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
-- 2. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE ai_models IS 'Registry of available AI models with their capabilities and pricing information. Claude Haiku 4.5 added on 2026-01-09 for fast and affordable AI assistance.';

-- =====================================================
-- 3. VERIFY MIGRATION SUCCESS
-- =====================================================

-- Query to verify Claude Haiku 4.5 was added:
-- SELECT
--   display_name,
--   provider,
--   input_token_cost_per_million as input_cost,
--   output_token_cost_per_million as output_cost,
--   token_multiplier,
--   is_active
-- FROM ai_models
-- WHERE model_name = 'claude-haiku-4-5-20251001';

-- =====================================================
-- 4. USAGE NOTES
-- =====================================================

-- Claude Haiku 4.5 can be assigned to any subscription tier by admins.
-- To assign to a tier, update the subscription_tiers table:
--
-- UPDATE subscription_tiers
-- SET ai_model_id = (
--   SELECT id FROM ai_models
--   WHERE model_name = 'claude-haiku-4-5-20251001'
-- )
-- WHERE name = 'student';  -- or 'free', 'student_lite', 'pro'
--
-- The model will also be available for users to select as their
-- preferred model in their profile settings (if they have permission).
