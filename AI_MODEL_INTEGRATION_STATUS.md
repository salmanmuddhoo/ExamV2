# AI Model Integration Status

## ✅ Completed

### 1. Database Schema (Migration: `20251106000002_create_ai_model_selection_system.sql`)
- ✅ Created `ai_models` table with full provider support
- ✅ Added 6 AI models: Gemini (2), Claude (2), OpenAI (2)
- ✅ Created `get_user_ai_model()` RPC function
- ✅ Added `preferred_ai_model_id` to profiles table
- ✅ Implemented RLS policies for model management

**Models Configured:**
| Provider | Model | Token Multiplier | Features |
|----------|-------|------------------|----------|
| Gemini | 2.0 Flash | 1.0x | Vision, Caching, Default |
| Gemini | 2.0 Flash Exp | 1.0x | Vision, Caching |
| Claude | 3.5 Sonnet | 2.0x | Vision, Caching, Superior reasoning |
| Claude | 3.5 Haiku | 1.5x | Vision, Caching, Fast |
| OpenAI | GPT-4o | 2.5x | Vision, High quality |
| OpenAI | GPT-4o Mini | 1.8x | Vision, Affordable |

### 2. User Interface
- ✅ Added AI Model Preference selector in Settings tab
- ✅ Displays model cards grouped by provider
- ✅ Shows capabilities (vision, caching), pricing, token multipliers
- ✅ Auto-save on selection
- ✅ Info boxes explaining token consumption

### 3. AI Provider Abstraction Layer (`supabase/functions/_shared/ai-providers.ts`)
- ✅ Created unified interface for all AI providers
- ✅ Implemented Gemini API wrapper with caching support
- ✅ Implemented Claude API wrapper (Anthropic Messages API)
- ✅ Implemented OpenAI API wrapper (Chat Completions API)
- ✅ Helper functions: `generateAIResponse()`, `getUserAIModel()`, `getDefaultAIModel()`
- ✅ Handles multimodal content (text + images) for all providers
- ✅ Consistent token counting across providers

## 🚧 Pending Implementation

### Edge Functions Integration

Two edge functions need to be updated to use the multi-provider abstraction:

#### 1. `exam-assistant/index.ts` (Complex)
**Status:** ⚠️ Requires careful refactoring

**Challenges:**
- Dual cache mode (Gemini built-in cache vs. database cache)
- Gemini-specific caching logic (~300 lines)
- Question validation and context management
- Conversation history handling

**Recommended Approach:**
- **Phase 1:** Keep Gemini-only but use abstraction for new conversations
- **Phase 2:** Add Claude/OpenAI support for simple queries (no caching initially)
- **Phase 3:** Implement provider-specific caching strategies

**Key Areas to Update:**
```typescript
// Line ~748: Get user's preferred AI model
const userModel = await getUserAIModel(supabase, userId);
const model = userModel || await getDefaultAIModel(supabase);

// Line ~760-890: Replace Gemini cache mode with:
if (model.supports_caching && model.provider === 'gemini') {
  // Use Gemini caching logic
} else {
  // Use standard generation without caching
  const response = await generateAIResponse({
    model,
    messages: [...],
    systemPrompt: contextualSystemPrompt,
    images: finalExamImages
  });
}

// Line ~950-1000: Replace Gemini API call with abstraction
```

#### 2. `generate-study-plan/index.ts` (Simpler)
**Status:** ✅ Ready for implementation

**Required Changes:**
```typescript
// Line ~23: Import AI provider helpers
import { generateAIResponse, getUserAIModel, getDefaultAIModel } from '../_shared/ai-providers.ts';

// Line ~210-220: Get user's preferred model
const userModel = await getUserAIModel(supabaseClient, user_id);
const model = userModel || await getDefaultAIModel(supabaseClient);
console.log(`🤖 Using AI model: ${model.display_name} (${model.provider})`);

// Line ~305-347: Replace Gemini API call
const aiResponse = await generateAIResponse({
  model,
  messages: [{
    role: 'user',
    content: prompt
  }],
  images: syllabusPdfBase64 ? [syllabusPdfBase64] : undefined,
  temperature: 0.7
});

const generatedText = aiResponse.content;
const promptTokenCount = aiResponse.promptTokens;
const candidatesTokenCount = aiResponse.completionTokens;
const totalTokenCount = aiResponse.totalTokens;

// Line ~510-522: Update token logging
const { data: modelData } = await supabaseClient
  .from('ai_models')
  .select('*')
  .eq('model_name', model.model_name)
  .single();

await supabaseClient.from('token_usage_logs').insert({
  user_id: user_id,
  model: model.model_name,
  provider: model.provider,
  prompt_tokens: promptTokenCount,
  completion_tokens: candidatesTokenCount,
  total_tokens: totalTokenCount,
  estimated_cost: totalCost,
  purpose: 'study_plan_generation',
  ai_model_id: modelData?.id,
  //...
});
```

## 🔑 Required Environment Variables

Add these to your Supabase Edge Functions secrets:

```bash
# Existing (keep these)
GEMINI_API_KEY=your_gemini_key
GEMINI_CACHE_API_KEY=your_gemini_cache_key  # Optional, for caching
GEMINI_ASSISTANT_API_KEY=your_gemini_key    # Fallback

# New (required for multi-provider support)
ANTHROPIC_API_KEY=your_claude_key            # For Claude models
CLAUDE_API_KEY=your_claude_key               # Alternative name
OPENAI_API_KEY=your_openai_key               # For OpenAI models
```

**Setting secrets via Supabase CLI:**
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set OPENAI_API_KEY=sk-proj-...
```

## 📊 Token Multiplier Impact

When users select different models, their token consumption will change:

- **Gemini (1x):** Baseline consumption
- **Claude Haiku (1.5x):** 50% more tokens per request
- **Claude Sonnet (2x):** 100% more tokens per request
- **GPT-4o Mini (1.8x):** 80% more tokens per request
- **GPT-4o (2.5x):** 150% more tokens per request

**Example:**
- User with 50,000 token limit using Gemini: ~50 conversations
- Same user using Claude Sonnet: ~25 conversations
- Same user using GPT-4o: ~20 conversations

## 🎯 Testing Checklist

### Database
- [ ] Run migration: `supabase db push`
- [ ] Verify ai_models table populated
- [ ] Test `get_user_ai_model()` function
- [ ] Verify profile update with preferred_ai_model_id

### UI
- [ ] Settings tab displays all AI models
- [ ] Model selection saves correctly
- [ ] Token multipliers displayed accurately
- [ ] Default selection works (null = system default)

### Edge Functions (After Implementation)
- [ ] Study plan generation works with Gemini
- [ ] Study plan generation works with Claude
- [ ] Study plan generation works with OpenAI
- [ ] Exam assistant works with user's preferred model
- [ ] Token counting accurate across providers
- [ ] Error handling for missing API keys
- [ ] Fallback to default model when user preference unavailable

## 🚀 Deployment Steps

1. **Deploy Database Migration:**
   ```bash
   git pull
   supabase db push
   ```

2. **Verify Migration:**
   ```sql
   SELECT * FROM ai_models;
   SELECT * FROM profiles LIMIT 5;
   ```

3. **Add API Keys (if not already set):**
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=your_key
   supabase secrets set OPENAI_API_KEY=your_key
   ```

4. **Deploy Edge Functions:**
   ```bash
   supabase functions deploy exam-assistant
   supabase functions deploy generate-study-plan
   ```

5. **Test in Production:**
   - Open Settings → AI Model Preference
   - Select different models
   - Test chat assistant
   - Test study plan generation
   - Monitor token usage

## 📝 Future Enhancements

### Short-term
- [ ] Implement provider-specific caching for Claude (Prompt Caching)
- [ ] Add cost tracking per provider
- [ ] Admin dashboard for model usage analytics
- [ ] A/B testing different models for quality

### Long-term
- [ ] Add more models (Gemini Pro, Claude Opus, GPT-4 Turbo)
- [ ] Implement model routing based on query complexity
- [ ] Add model performance metrics (response time, quality scores)
- [ ] Implement cost optimization suggestions

## 🐛 Known Limitations

1. **Caching:** Currently only Gemini supports built-in caching. Claude has Prompt Caching but not yet implemented.
2. **Conversation History:** Optimized for Gemini format; may need adjustments for other providers
3. **Image Processing:** All providers support vision, but format conversions are simplified
4. **Token Estimation:** Multipliers are estimates; actual usage may vary slightly

## 📞 Support

For issues or questions:
- Database issues: Check migration logs
- API errors: Verify environment variables are set correctly
- UI issues: Check browser console for errors
- Edge function issues: Check Supabase function logs
