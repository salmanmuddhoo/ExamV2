# Gemini 2.5 Pro Setup Guide

## Overview

Gemini 2.5 Pro is now available as an AI model option for subscription tiers. This model offers superior reasoning capabilities compared to Gemini 2.0 Flash, making it ideal for complex mathematical and analytical tasks.

## Key Features

- **Advanced Reasoning**: Best-in-class performance for complex problem-solving
- **Large Context**: 2M token context window (vs 1M for Gemini 2.0 Flash)
- **Vision Support**: Can analyze images and diagrams
- **Context Caching**: Supports Gemini's context caching for efficiency

## Pricing & Token Consumption

### Gemini API Pricing
- **Input**: $1.25 per 1M tokens
- **Output**: $5.00 per 1M tokens

### Token Multiplier
Gemini 2.5 Pro consumes **approximately 16-17x more tokens** than Gemini 2.0 Flash baseline.

### Cost Calculation Example
For a conversation with 1,000 input tokens and 500 output tokens:

**Gemini 2.0 Flash (baseline):**
- Cost: (1000 / 1M) × $0.075 + (500 / 1M) × $0.30 = **$0.000225**
- Tokens deducted: **1,500 tokens**

**Gemini 2.5 Pro:**
- Cost: (1000 / 1M) × $1.25 + (500 / 1M) × $5.00 = **$0.00375**
- Cost ratio: $0.00375 / $0.000225 = **16.67x**
- Tokens deducted: 1,500 × 16.67 = **25,005 tokens**

The system automatically calculates and deducts the appropriate number of tokens based on actual API costs using the `calculate_cost_based_token_consumption()` database function.

## Deployment Instructions

### Step 1: Deploy the Migration

```bash
# From project root
cd /home/user/ExamV2

# Deploy the migration to Supabase
supabase db push
```

Or deploy manually via Supabase Dashboard:
1. Go to Supabase Dashboard → SQL Editor
2. Paste the contents of `supabase/migrations/20260108000001_add_gemini_2_5_pro_model.sql`
3. Click Run

### Step 2: Verify Model is Available

```sql
-- Check Gemini 2.5 Pro was added successfully
SELECT
  display_name,
  provider,
  model_name,
  input_token_cost_per_million as input_cost,
  output_token_cost_per_million as output_cost,
  token_multiplier,
  is_active
FROM ai_models
WHERE model_name = 'gemini-2.5-pro';
```

Expected result:
```
display_name: Gemini 2.5 Pro
provider: gemini
model_name: gemini-2.5-pro
input_cost: 1.25
output_cost: 5.00
token_multiplier: 16.7
is_active: true
```

## Configuration Instructions

### Assign Gemini 2.5 Pro to a Subscription Tier

1. **Navigate to Configuration**
   - Go to your admin dashboard
   - Click on **Configuration** tab
   - Select **Tier Config**

2. **Select the Tier**
   - Find the tier you want to update (e.g., Professional Package, Pro tier)
   - Each tier has its own configuration card

3. **Choose AI Model**
   - In the tier configuration card, find the **AI Model** dropdown
   - Select **"Gemini 2.5 Pro (gemini)"**

4. **Save Configuration**
   - Click the **Save** button at the bottom of the tier card
   - You should see a success message

5. **Verify Selection**
   - Refresh the page
   - Confirm the AI Model dropdown shows "Gemini 2.5 Pro"

### Recommended Tier Assignments

| Tier | Recommended Model | Reasoning |
|------|------------------|-----------|
| Free | Gemini 2.0 Flash | Cost-effective for trial users |
| Student Lite | Gemini 2.0 Flash | Balanced performance and cost |
| Student Package | Gemini 2.0 Flash or Gemini 2.5 Pro | Depends on pricing strategy |
| Professional Package | **Gemini 2.5 Pro** | Premium model for premium tier |

## Usage

### Chat Assistant

Once a tier is assigned Gemini 2.5 Pro:
1. Users on that tier open the **Chat Assistant**
2. The system automatically uses Gemini 2.5 Pro for their conversations
3. Token consumption is automatically calculated based on actual costs
4. Users consume 16-17x more tokens per interaction

### Study Plan Generation

When users on a Gemini 2.5 Pro tier create study plans:
1. Go to **Study Plan Wizard**
2. Fill out the study plan details
3. Click "Generate Plan"
4. The system uses Gemini 2.5 Pro to generate the plan
5. Token deduction reflects the higher cost

## Token Limit Recommendations

Since Gemini 2.5 Pro consumes 16-17x more tokens, consider adjusting token limits:

| Tier | Current Token Limit | With Gemini 2.0 Flash | With Gemini 2.5 Pro |
|------|--------------------|-----------------------|---------------------|
| Free | 10,000 | ~10-15 conversations | ~1 conversation |
| Student Lite | 50,000 | ~50-75 conversations | ~3-5 conversations |
| Student Package | 200,000 | ~200-300 conversations | ~12-18 conversations |
| Professional | Unlimited | Unlimited conversations | Unlimited conversations |

**Recommendation**: If assigning Gemini 2.5 Pro to a tier with token limits, either:
- Increase the token limit by 15-20x to maintain the same usage capacity
- Keep the limit and communicate the premium model's capabilities justify lower usage volume
- Use unlimited tokens for premium tiers with Gemini 2.5 Pro

## Token Consumption Technical Details

### How Token Deduction Works

The system uses a **cost-based token consumption model**:

1. **User makes AI request** (chat or study plan)
2. **API returns usage data**: prompt tokens, completion tokens, actual cost
3. **System calculates Gemini-equivalent cost**:
   ```
   gemini_cost = (prompt_tokens / 1M) × $0.075 + (completion_tokens / 1M) × $0.30
   ```
4. **Calculate cost ratio**:
   ```
   cost_ratio = actual_cost / gemini_cost
   ```
5. **Adjust token deduction**:
   ```
   tokens_to_deduct = (prompt_tokens + completion_tokens) × cost_ratio
   ```

This ensures platform costs remain predictable regardless of which model users choose.

### Database Function

The calculation is handled by `calculate_cost_based_token_consumption()`:

```sql
SELECT calculate_cost_based_token_consumption(
  1000,  -- prompt tokens
  500,   -- completion tokens
  0.00375 -- actual cost in USD
);
-- Returns: 25005 (tokens to deduct from user balance)
```

## Monitoring & Analytics

### Track Model Usage

```sql
-- See which tiers are using which models
SELECT
  st.display_name as tier_name,
  am.display_name as ai_model,
  am.token_multiplier,
  COUNT(DISTINCT us.user_id) as user_count
FROM subscription_tiers st
LEFT JOIN ai_models am ON st.ai_model_id = am.id
LEFT JOIN user_subscriptions us ON us.tier_id = st.id AND us.status = 'active'
GROUP BY st.display_name, am.display_name, am.token_multiplier
ORDER BY st.display_order;
```

### Track Token Consumption by Model

```sql
-- Token usage by AI model
SELECT
  am.display_name as model_name,
  COUNT(*) as request_count,
  SUM(tul.prompt_tokens) as total_prompt_tokens,
  SUM(tul.completion_tokens) as total_completion_tokens,
  SUM(tul.total_tokens) as total_tokens,
  SUM(tul.estimated_cost) as total_cost_usd
FROM token_usage_logs tul
LEFT JOIN ai_models am ON tul.ai_model_id = am.id
WHERE tul.created_at >= NOW() - INTERVAL '30 days'
GROUP BY am.display_name
ORDER BY total_cost_usd DESC;
```

### Identify High-Cost Users

```sql
-- Users consuming the most tokens (potential Gemini 2.5 Pro users)
SELECT
  p.email,
  st.display_name as tier,
  am.display_name as model,
  SUM(tul.total_tokens) as total_tokens_used,
  SUM(tul.estimated_cost) as total_cost_usd
FROM token_usage_logs tul
JOIN profiles p ON tul.user_id = p.id
LEFT JOIN user_subscriptions us ON us.user_id = p.id AND us.status = 'active'
LEFT JOIN subscription_tiers st ON us.tier_id = st.id
LEFT JOIN ai_models am ON tul.ai_model_id = am.id
WHERE tul.created_at >= NOW() - INTERVAL '30 days'
GROUP BY p.email, st.display_name, am.display_name
ORDER BY total_cost_usd DESC
LIMIT 20;
```

## Troubleshooting

### Model Not Appearing in Dropdown

**Problem**: Gemini 2.5 Pro doesn't show up in Tier Config dropdown

**Solutions**:
1. Verify migration was deployed:
   ```sql
   SELECT * FROM ai_models WHERE model_name = 'gemini-2.5-pro';
   ```
2. Check `is_active` is `true`:
   ```sql
   UPDATE ai_models SET is_active = true WHERE model_name = 'gemini-2.5-pro';
   ```
3. Clear browser cache and refresh the Configuration page

### Users Running Out of Tokens Quickly

**Problem**: Users on Gemini 2.5 Pro tier consuming tokens very fast

**Solutions**:
1. This is expected - Gemini 2.5 Pro uses 16-17x more tokens
2. Options:
   - Increase token limit for that tier
   - Switch tier back to Gemini 2.0 Flash
   - Communicate the premium model's value to users
   - Make the tier unlimited tokens

### API Key Issues

**Problem**: Gemini 2.5 Pro API calls failing

**Solutions**:
1. Verify your Gemini API key has access to Gemini 2.5 Pro:
   - Go to Google AI Studio: https://aistudio.google.com/
   - Check your API key's model access
2. Ensure API key is set in Supabase environment variables:
   - `GEMINI_API_KEY` or `GEMINI_UPLOAD_API_KEY`

### Token Deduction Not Working

**Problem**: Tokens not being deducted correctly for Gemini 2.5 Pro

**Diagnosis**:
```sql
-- Check recent token usage logs
SELECT
  tul.created_at,
  am.display_name as model,
  tul.prompt_tokens,
  tul.completion_tokens,
  tul.total_tokens,
  tul.estimated_cost,
  tul.adjusted_tokens_consumed
FROM token_usage_logs tul
LEFT JOIN ai_models am ON tul.ai_model_id = am.id
WHERE tul.user_id = 'USER_ID_HERE'
ORDER BY tul.created_at DESC
LIMIT 10;
```

**Solution**:
- Check `adjusted_tokens_consumed` field
- Should be ~16-17x higher for Gemini 2.5 Pro vs Gemini 2.0 Flash
- If not, verify `calculate_cost_based_token_consumption()` function exists and works

## Best Practices

1. **Reserve for Premium Tiers**: Assign Gemini 2.5 Pro to your highest-value tiers to justify the cost

2. **Communicate Value**: Let users know they're getting a premium AI model
   - Update tier descriptions to mention "Gemini 2.5 Pro"
   - Highlight superior reasoning capabilities
   - Explain it's best for complex problems

3. **Monitor Costs**: Regularly check token usage analytics to ensure costs are predictable

4. **Adjust Token Limits**: Increase token allocations by 15-20x for tiers using Gemini 2.5 Pro

5. **Test First**: Try Gemini 2.5 Pro on a single tier first, monitor costs, then expand

6. **Consider Hybrid Approach**: Use Gemini 2.5 Pro only for study plan generation (complex task) and Gemini 2.0 Flash for chat (frequent, simpler queries)

## Support

If you encounter issues with Gemini 2.5 Pro:
1. Check the Troubleshooting section above
2. Review Supabase Edge Function logs for error messages
3. Verify API keys have proper access
4. Check token usage logs for accurate cost tracking

## Changelog

- **2026-01-08**: Initial release - Added Gemini 2.5 Pro model with 16.7x token multiplier
