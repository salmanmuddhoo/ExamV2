# Token Cost Management System

## Overview

This system ensures that platform costs remain predictable regardless of which AI model users choose. When users select more expensive models (like Claude or GPT-4o instead of Gemini), they consume proportionally more tokens from their subscription allocation.

## How It Works

### 1. Cost-Based Token Calculation

Instead of using fixed multipliers, the system calculates token consumption dynamically based on the **actual USD cost** of each API request compared to the Gemini baseline.

**Formula:**
```
Adjusted Tokens = Actual Tokens × (Actual Cost / Gemini Equivalent Cost)
```

**Example:**
- User makes a request using Claude 3.5 Sonnet
- Actual tokens used: 2,500 (1,800 input + 700 output)
- Actual cost: $0.01575
  - Input: 1,800 tokens × $3.00/1M = $0.0054
  - Output: 700 tokens × $15.00/1M = $0.0105
- Gemini equivalent cost: $0.000345
  - Input: 1,800 tokens × $0.075/1M = $0.000135
  - Output: 700 tokens × $0.30/1M = $0.000210
- Cost ratio: $0.01575 / $0.000345 = 45.65x
- **Tokens deducted from allocation: 2,500 × 45.65 = 114,130 tokens**

This means using Claude Sonnet for this request consumes ~46x more from the user's token allocation than using Gemini would.

### 2. Baseline Pricing (Gemini 2.0 Flash)

All token allocations are based on Gemini pricing:
- **Input tokens:** $0.075 per 1M tokens
- **Output tokens:** $0.30 per 1M tokens

### 3. Official Model Pricing (2025)

| Model | Input Cost | Output Cost | Approx. Multiplier |
|-------|-----------|-------------|-------------------|
| **Gemini 2.0 Flash** | $0.075/1M | $0.30/1M | 1.0x (baseline) |
| **Gemini 2.0 Flash Exp** | $0.075/1M | $0.30/1M | 1.0x |
| **GPT-4o Mini** | $0.15/1M | $0.60/1M | 2.0x |
| **Claude 3.5 Haiku** | $1.00/1M | $5.00/1M | 15-20x |
| **GPT-4o** | $2.50/1M | $10.00/1M | 30-35x |
| **Claude 3.5 Sonnet** | $3.00/1M | $15.00/1M | 40-50x |

**Note:** The actual multiplier varies based on the input/output token ratio of each request.

## Implementation

### Database Function

The `calculate_cost_based_token_consumption()` function handles the calculation:

```sql
CREATE FUNCTION calculate_cost_based_token_consumption(
  p_actual_prompt_tokens INTEGER,
  p_actual_completion_tokens INTEGER,
  p_actual_cost DECIMAL(10, 6)
) RETURNS INTEGER
```

**Location:** `/supabase/migrations/20251107000000_update_token_multipliers_accurate_costs.sql`

### Edge Functions

Both `exam-assistant` and `generate-study-plan` functions call this database function:

```typescript
const { data: adjustedTokenData } = await supabase
  .rpc('calculate_cost_based_token_consumption', {
    p_actual_prompt_tokens: promptTokenCount,
    p_actual_completion_tokens: candidatesTokenCount,
    p_actual_cost: totalCost
  });

const tokensToDeduct = adjustedTokenData || totalTokenCount;
```

## Impact on Users

### Token Allocations per Tier

| Tier | Monthly Tokens | With Gemini | With GPT-4o Mini | With Claude Haiku | With GPT-4o | With Claude Sonnet |
|------|---------------|-------------|------------------|-------------------|-------------|-------------------|
| **Free** | 50,000 | ~20 requests | ~10 requests | ~3 requests | ~2 requests | ~1 request |
| **Student** | 500,000 | ~200 requests | ~100 requests | ~30 requests | ~15 requests | ~11 requests |
| **Pro** | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |

*Assuming ~2,500 tokens per request average*

### User Model Selection

Users can select their preferred AI model in their profile settings. The system will:
1. Show the token multiplier estimate in the UI
2. Track actual costs in `token_usage_logs`
3. Deduct cost-adjusted tokens from their allocation
4. Display both actual tokens and Gemini-equivalent tokens in logs

## Benefits

### For Platform Owners
- **Cost Predictability:** Expensive model usage is controlled through token allocation
- **Fair Resource Distribution:** Users can't abuse expensive models without limit
- **Accurate Analytics:** Track actual USD costs alongside token usage

### For Users
- **Model Choice:** Freedom to choose the best model for their needs
- **Transparency:** See exact token consumption for each request
- **Fair Pricing:** Token allocations reflect actual API costs

## Monitoring & Analytics

### Token Usage Logs

The `token_usage_logs` table tracks:
- `prompt_tokens`: Actual input tokens used
- `completion_tokens`: Actual output tokens used
- `total_tokens`: Sum of input + output
- `estimated_cost`: Actual USD cost
- `ai_model_id`: Which model was used

### Analytics Dashboard

The admin can view:
- Total costs by model
- Token consumption patterns
- Cost per request averages
- Model usage distribution

**Location:** Admin Dashboard → Analytics tab

## Migration Notes

### Applying the Migration

The migration automatically:
1. Creates the `calculate_cost_based_token_consumption()` function
2. Updates `token_multiplier` values in `ai_models` table for better UI estimates
3. Updates model descriptions to reflect new multipliers

### Backward Compatibility

If the function fails to calculate adjusted tokens:
- Falls back to using actual token count (no adjustment)
- Logs an error for debugging
- Does not fail the user's request

## Future Enhancements

1. **Caching Optimization:** Further reduce costs with prompt caching
2. **Batch Processing:** Use batch APIs for 50% cost savings
3. **Dynamic Pricing:** Adjust token allocations based on real-time API costs
4. **Usage Alerts:** Notify users when they're using expensive models heavily

## References

- Gemini Pricing: https://ai.google.dev/gemini-api/docs/pricing
- Claude Pricing: https://docs.claude.com/en/docs/about-claude/pricing
- OpenAI Pricing: https://openai.com/api/pricing/

---

**Last Updated:** 2025-11-07
**Migration File:** `20251107000000_update_token_multipliers_accurate_costs.sql`
