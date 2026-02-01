-- Migration: Recalculate Historical Token Usage Costs with Updated Pricing
-- Description: Updates all past token_usage_logs records with correct costs based on updated AI model pricing
-- Date: 2026-02-01
--
-- This fixes analytics to show accurate historical costs, especially for Gemini 2.5 Flash
-- which had incorrect pricing (was $0.075/$0.30, now $0.30/$2.50)

-- =====================================================
-- 1. RECALCULATE COSTS FOR RECORDS WITH AI_MODEL_ID
-- =====================================================

DO $$
DECLARE
  updated_count INTEGER := 0;
  total_count INTEGER := 0;
  old_total_cost DECIMAL(12, 6) := 0;
  new_total_cost DECIMAL(12, 6) := 0;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO total_count FROM token_usage_logs;

  RAISE NOTICE 'Starting cost recalculation for % total records...', total_count;

  -- Update records that have ai_model_id (can join to ai_models table)
  WITH updated_costs AS (
    UPDATE token_usage_logs tul
    SET estimated_cost = (
      (tul.prompt_tokens::DECIMAL / 1000000.0) * am.input_token_cost_per_million +
      (tul.completion_tokens::DECIMAL / 1000000.0) * am.output_token_cost_per_million
    )
    FROM ai_models am
    WHERE tul.ai_model_id = am.id
      AND tul.ai_model_id IS NOT NULL
    RETURNING tul.estimated_cost
  )
  SELECT COUNT(*) INTO updated_count FROM updated_costs;

  RAISE NOTICE '✅ Updated % records with ai_model_id', updated_count;

  -- Get summary of costs before/after for records with model info
  SELECT
    SUM(tul_old.estimated_cost),
    SUM(
      (tul_new.prompt_tokens::DECIMAL / 1000000.0) * am.input_token_cost_per_million +
      (tul_new.completion_tokens::DECIMAL / 1000000.0) * am.output_token_cost_per_million
    )
  INTO old_total_cost, new_total_cost
  FROM token_usage_logs tul_old
  JOIN token_usage_logs tul_new ON tul_old.id = tul_new.id
  LEFT JOIN ai_models am ON tul_new.ai_model_id = am.id
  WHERE tul_new.ai_model_id IS NOT NULL;

  RAISE NOTICE 'Cost recalculation summary (records with ai_model_id):';
  RAISE NOTICE '  - Old total cost: $%', COALESCE(old_total_cost, 0);
  RAISE NOTICE '  - New total cost: $%', COALESCE(new_total_cost, 0);
  RAISE NOTICE '  - Difference: $%', COALESCE(new_total_cost - old_total_cost, 0);
END $$;

-- =====================================================
-- 2. RECALCULATE COSTS FOR RECORDS WITHOUT AI_MODEL_ID
-- =====================================================

-- For records without ai_model_id, try to match by model name
DO $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  WITH updated_costs AS (
    UPDATE token_usage_logs tul
    SET
      estimated_cost = (
        (tul.prompt_tokens::DECIMAL / 1000000.0) * am.input_token_cost_per_million +
        (tul.completion_tokens::DECIMAL / 1000000.0) * am.output_token_cost_per_million
      ),
      ai_model_id = am.id  -- Also set the ai_model_id for future reference
    FROM ai_models am
    WHERE tul.ai_model_id IS NULL
      AND tul.model IS NOT NULL
      AND am.model_name = tul.model
    RETURNING tul.id
  )
  SELECT COUNT(*) INTO updated_count FROM updated_costs;

  RAISE NOTICE '✅ Updated % records by matching model name', updated_count;
END $$;

-- =====================================================
-- 3. HANDLE LEGACY RECORDS (Gemini models by provider)
-- =====================================================

-- For records that only have provider='gemini' but no specific model
DO $$
DECLARE
  updated_count INTEGER := 0;
  gemini_flash_id UUID;
BEGIN
  -- Get Gemini 2.5 Flash model ID
  SELECT id INTO gemini_flash_id
  FROM ai_models
  WHERE model_name = 'gemini-2.5-flash'
  LIMIT 1;

  IF gemini_flash_id IS NOT NULL THEN
    WITH updated_costs AS (
      UPDATE token_usage_logs tul
      SET
        estimated_cost = (
          (tul.prompt_tokens::DECIMAL / 1000000.0) * 0.30 +
          (tul.completion_tokens::DECIMAL / 1000000.0) * 2.50
        ),
        ai_model_id = gemini_flash_id
      FROM ai_models am
      WHERE tul.ai_model_id IS NULL
        AND tul.provider = 'gemini'
        AND (tul.model IS NULL OR tul.model IN ('gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-pro-vision', 'gemini-pro'))
      RETURNING tul.id
    )
    SELECT COUNT(*) INTO updated_count FROM updated_costs;

    RAISE NOTICE '✅ Updated % legacy Gemini records with Gemini 2.5 Flash pricing', updated_count;
  END IF;
END $$;

-- =====================================================
-- 4. FINAL VERIFICATION AND SUMMARY
-- =====================================================

DO $$
DECLARE
  total_records INTEGER;
  records_with_cost INTEGER;
  records_without_cost INTEGER;
  total_cost_sum DECIMAL(12, 6);
  avg_cost_per_request DECIMAL(12, 6);
  cost_by_provider RECORD;
BEGIN
  -- Count total records
  SELECT COUNT(*) INTO total_records FROM token_usage_logs;

  -- Count records with cost
  SELECT COUNT(*), SUM(estimated_cost), AVG(estimated_cost)
  INTO records_with_cost, total_cost_sum, avg_cost_per_request
  FROM token_usage_logs
  WHERE estimated_cost > 0;

  -- Count records without cost
  SELECT COUNT(*) INTO records_without_cost
  FROM token_usage_logs
  WHERE estimated_cost = 0 OR estimated_cost IS NULL;

  RAISE NOTICE '';
  RAISE NOTICE '=== COST RECALCULATION COMPLETE ===';
  RAISE NOTICE 'Total records: %', total_records;
  RAISE NOTICE 'Records with cost: % (%.1f%%)', records_with_cost, (records_with_cost::DECIMAL / total_records * 100);
  RAISE NOTICE 'Records without cost: % (%.1f%%)', records_without_cost, (records_without_cost::DECIMAL / total_records * 100);
  RAISE NOTICE 'Total cost across all records: $%', COALESCE(total_cost_sum, 0);
  RAISE NOTICE 'Average cost per request: $%', COALESCE(avg_cost_per_request, 0);
  RAISE NOTICE '';
  RAISE NOTICE 'Cost breakdown by provider:';

  -- Show cost by provider
  FOR cost_by_provider IN
    SELECT
      provider,
      COUNT(*) as request_count,
      SUM(estimated_cost) as total_cost,
      AVG(estimated_cost) as avg_cost
    FROM token_usage_logs
    WHERE estimated_cost > 0
    GROUP BY provider
    ORDER BY total_cost DESC
  LOOP
    RAISE NOTICE '  %: % requests, total: $%, avg: $%',
      cost_by_provider.provider,
      cost_by_provider.request_count,
      cost_by_provider.total_cost,
      cost_by_provider.avg_cost;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Analytics now reflect accurate costs with updated pricing!';
END $$;

-- =====================================================
-- 5. CREATE INDEX FOR BETTER ANALYTICS PERFORMANCE
-- =====================================================

-- Index on estimated_cost for faster cost queries
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_estimated_cost
ON token_usage_logs(estimated_cost)
WHERE estimated_cost > 0;

-- Index on created_at + estimated_cost for time-based cost queries
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_created_cost
ON token_usage_logs(created_at, estimated_cost);

-- Index on provider + estimated_cost for provider-based analytics
CREATE INDEX IF NOT EXISTS idx_token_usage_logs_provider_cost
ON token_usage_logs(provider, estimated_cost);

COMMENT ON INDEX idx_token_usage_logs_estimated_cost IS 'Optimizes cost-based analytics queries';
COMMENT ON INDEX idx_token_usage_logs_created_cost IS 'Optimizes time-series cost analytics';
COMMENT ON INDEX idx_token_usage_logs_provider_cost IS 'Optimizes provider-based cost breakdown';
