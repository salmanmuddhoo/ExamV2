# Multi-AI Provider Setup Guide

This guide will help you set up and deploy the multi-AI provider support for Claude and OpenAI alongside Gemini.

## 🎯 What's Included

The application now supports three AI providers:
- **Gemini** (Google) - Default, with caching support
- **Claude** (Anthropic) - Superior reasoning, 1.5-2x tokens
- **OpenAI** (GPT-4o/Mini) - High quality, 1.8-2.5x tokens

Users can select their preferred model in Profile → Settings → AI Model Preference.

## 📋 Prerequisites

1. Supabase project with CLI access
2. API keys for the providers you want to enable
3. Git access to the repository

## 🔧 Step 1: Get API Keys

### Gemini (Already configured)
```
✅ GEMINI_API_KEY - Already set
✅ GEMINI_CACHE_API_KEY - Optional, for caching
```

### Claude (Anthropic)
1. Go to https://console.anthropic.com/
2. Create an account or sign in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key (starts with `sk-ant-`)

### OpenAI
1. Go to https://platform.openai.com/
2. Create an account or sign in
3. Navigate to API Keys
4. Create a new API key
5. Copy the key (starts with `sk-proj-` or `sk-`)

## 🚀 Step 2: Set Environment Variables

### Option A: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to: Project Settings → Edge Functions
3. Add the following secrets:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-proj-your-key-here
```

### Option B: Using Supabase CLI

```bash
# Set Claude API key
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here

# Set OpenAI API key
supabase secrets set OPENAI_API_KEY=sk-proj-your-key-here

# Verify secrets are set
supabase secrets list
```

### Optional: Alternative Names

The system will also check these alternative environment variable names:
- `CLAUDE_API_KEY` (alternative to ANTHROPIC_API_KEY)
- All standard variations

## 📦 Step 3: Deploy Database Migration

The database schema for AI models is already in the migrations. Apply it:

```bash
# Pull latest code
git pull origin claude/study-plan-grade-selection-011CUqB5D5w5tkQJriKMUnCC

# Apply migrations
supabase db push

# Verify migration
supabase db remote execute "SELECT count(*) FROM ai_models;"
# Should return 6 models
```

### Verify Database Setup

```sql
-- Check AI models are populated
SELECT provider, model_name, display_name, is_default, is_active
FROM ai_models
ORDER BY provider, display_name;

-- Should show:
-- gemini  | gemini-2.0-flash           | Gemini 2.0 Flash         | true  | true
-- gemini  | gemini-2.0-flash-exp       | Gemini 2.0 Flash (Exp)   | false | true
-- claude  | claude-3-5-haiku-20241022  | Claude 3.5 Haiku         | false | true
-- claude  | claude-3-5-sonnet-20241022 | Claude 3.5 Sonnet        | false | true
-- openai  | gpt-4o                     | GPT-4o                   | false | true
-- openai  | gpt-4o-mini                | GPT-4o Mini              | false | true

-- Verify profiles table has new column
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'preferred_ai_model_id';
```

## 🎨 Step 4: Deploy Edge Functions

Deploy the updated edge functions:

```bash
# Deploy both functions
supabase functions deploy exam-assistant
supabase functions deploy generate-study-plan

# Or deploy all functions
supabase functions deploy
```

### Verify Deployment

```bash
# Check function logs
supabase functions logs exam-assistant --tail
supabase functions logs generate-study-plan --tail
```

## ✅ Step 5: Test the Integration

### Test 1: UI Settings
1. Log in to the application
2. Go to Profile → Settings tab
3. Verify you see "AI Model Preference" section
4. Verify all 6 models are displayed with correct info
5. Select "Claude 3.5 Haiku"
6. Verify selection saves (check for success message)

### Test 2: Study Plan Generation
1. Go to Study Plan
2. Create a new study plan
3. Check function logs: `supabase functions logs generate-study-plan --tail`
4. Look for: `✅ Using AI model: Claude 3.5 Haiku (claude)`
5. Verify study plan generates successfully
6. Check token usage is tracked correctly

### Test 3: Exam Assistant
1. Open an exam paper
2. Ask a question
3. Check function logs: `supabase functions logs exam-assistant --tail`
4. Look for: `✅ Using AI model: Claude 3.5 Haiku (claude)`
5. Verify answer is generated
6. Check token usage is tracked

### Test 4: Token Tracking
```sql
-- Check recent token usage
SELECT
  tul.model,
  tul.provider,
  tul.prompt_tokens,
  tul.completion_tokens,
  tul.total_tokens,
  tul.estimated_cost,
  tul.created_at
FROM token_usage_logs tul
ORDER BY created_at DESC
LIMIT 10;

-- Should show mix of providers (gemini, claude, openai)
```

### Test 5: Cost Calculation
```sql
-- Verify costs are calculated correctly
SELECT
  am.provider,
  am.model_name,
  am.input_token_cost_per_million,
  am.output_token_cost_per_million,
  COUNT(tul.id) as usage_count,
  SUM(tul.total_tokens) as total_tokens,
  SUM(tul.estimated_cost) as total_cost
FROM ai_models am
LEFT JOIN token_usage_logs tul ON am.id = tul.ai_model_id
WHERE tul.created_at > NOW() - INTERVAL '7 days'
GROUP BY am.provider, am.model_name, am.input_token_cost_per_million, am.output_token_cost_per_million
ORDER BY total_cost DESC;
```

## 🐛 Troubleshooting

### Issue: "Claude API key not configured"

**Solution:**
```bash
# Check if secret is set
supabase secrets list | grep ANTHROPIC

# If not set, set it
supabase secrets set ANTHROPIC_API_KEY=your-key-here

# Redeploy function
supabase functions deploy exam-assistant
```

### Issue: "No response generated"

**Check logs:**
```bash
supabase functions logs exam-assistant --tail
```

**Common causes:**
- API key incorrect or expired
- Rate limits exceeded
- Network/connectivity issues
- Model name mismatch

### Issue: Models not showing in UI

**Check database:**
```sql
SELECT * FROM ai_models WHERE is_active = true;
```

**If empty:**
```bash
# Re-run migration
supabase db push
```

### Issue: Token costs seem wrong

**Verify pricing in database:**
```sql
SELECT
  provider,
  model_name,
  input_token_cost_per_million,
  output_token_cost_per_million
FROM ai_models;
```

**Update pricing if needed:**
```sql
UPDATE ai_models
SET
  input_token_cost_per_million = 3.00,
  output_token_cost_per_million = 15.00
WHERE model_name = 'claude-3-5-sonnet-20241022';
```

## 📊 Monitoring Usage

### Dashboard Query - Usage by Provider
```sql
SELECT
  provider,
  COUNT(*) as requests,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost) as total_cost,
  AVG(total_tokens) as avg_tokens_per_request
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY provider
ORDER BY total_cost DESC;
```

### Dashboard Query - Top Users by Provider
```sql
SELECT
  p.email,
  tul.provider,
  COUNT(*) as requests,
  SUM(tul.total_tokens) as tokens,
  SUM(tul.estimated_cost) as cost
FROM token_usage_logs tul
JOIN profiles p ON p.id = tul.user_id
WHERE tul.created_at > NOW() - INTERVAL '7 days'
GROUP BY p.email, tul.provider
ORDER BY cost DESC
LIMIT 20;
```

### Dashboard Query - Model Preferences
```sql
SELECT
  am.provider,
  am.display_name,
  COUNT(p.id) as users_count,
  ROUND(COUNT(p.id) * 100.0 / (SELECT COUNT(*) FROM profiles WHERE preferred_ai_model_id IS NOT NULL), 2) as percentage
FROM profiles p
JOIN ai_models am ON am.id = p.preferred_ai_model_id
GROUP BY am.provider, am.display_name
ORDER BY users_count DESC;
```

## 🔐 Security Best Practices

1. **API Keys**: Store only in Supabase secrets, never in code
2. **Rate Limits**: Monitor usage to avoid hitting provider limits
3. **Cost Alerts**: Set up alerts for unexpected cost spikes
4. **Key Rotation**: Rotate API keys periodically
5. **Access Control**: Limit who can change AI model settings

## 💰 Cost Management

### Estimated Monthly Costs per 1M Tokens

| Provider | Model | Input | Output | Total (50/50 split) |
|----------|-------|-------|--------|---------------------|
| Gemini | 2.0 Flash | $0.075 | $0.30 | $0.19 |
| Claude | 3.5 Haiku | $1.00 | $5.00 | $3.00 |
| Claude | 3.5 Sonnet | $3.00 | $15.00 | $9.00 |
| OpenAI | GPT-4o Mini | $0.15 | $0.60 | $0.38 |
| OpenAI | GPT-4o | $2.50 | $10.00 | $6.25 |

### Token Multiplier Impact

If a user typically uses 50,000 tokens/month on Gemini:
- **Claude Haiku (1.5x)**: ~75,000 tokens/month
- **Claude Sonnet (2x)**: ~100,000 tokens/month
- **GPT-4o (2.5x)**: ~125,000 tokens/month

Make sure subscription tiers account for this!

## 📚 Additional Resources

- [Anthropic API Documentation](https://docs.anthropic.com/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

## 🎉 Success Checklist

- [ ] API keys set for all desired providers
- [ ] Database migration applied successfully
- [ ] Edge functions deployed
- [ ] Settings UI shows all models
- [ ] Study plan generation works with Claude/OpenAI
- [ ] Exam assistant works with Claude/OpenAI
- [ ] Token usage logged correctly
- [ ] Cost calculations accurate
- [ ] User preferences saved and respected
- [ ] Monitoring queries set up

## 🚨 Important Notes

1. **PDF Support**: Only Gemini supports PDF input directly. Claude and OpenAI will use text descriptions.
2. **Caching**: Only Gemini has built-in caching currently. Other providers may be slower for repeated queries.
3. **Token Limits**: Each provider has different context limits. Monitor for truncation issues.
4. **API Versions**: Keep track of model versions and update when providers release new versions.

## 🆘 Getting Help

If you encounter issues:
1. Check function logs first
2. Verify API keys are correct
3. Check database tables are populated
4. Review error messages in browser console
5. Check `AI_MODEL_INTEGRATION_STATUS.md` for known issues

---

**Ready to go!** Your application now supports multiple AI providers. Users can choose their preferred model based on their needs for speed, quality, or cost.
