# Dual AI Caching System Documentation

## Overview

The AI exam assistant now supports **two caching modes** that you can toggle in the admin dashboard:

1. **Gemini Built-in Cache** (Recommended) - Uses Gemini 2.0 Flash's context caching API
2. **Own Database Cache** (Legacy) - Uses your existing database conversation history system

## How It Works

### Gemini Cache Mode (`useGeminiCache = true`)

**First Question (e.g., "Question 5"):**
```
1. User asks about Question 5
2. System creates Gemini cache containing:
   - System prompt
   - Question context prompt
   - Exam paper images
   - Marking scheme text
3. Cache saved to Gemini with TTL of 1 hour
4. Cache metadata stored in your database
5. AI generates response using the cache
```

**Follow-up Question (e.g., "Can you explain the second step?"):**
```
1. User asks follow-up about same question
2. System retrieves existing cache from Gemini
3. Only sends the new user message (no context re-sent!)
4. AI generates response using cached context
5. Increments cache use counter
```

**💰 Cost Savings:**
- First question: Normal cost (~10,000 tokens)
- Follow-up questions: ~90% cheaper (~1,000 tokens)
- Images and system prompt NOT re-sent on follow-ups

### Own Cache Mode (`useGeminiCache = false`)

**How it works (existing behavior):**
```
1. User asks question
2. System loads conversation history from database
3. Sends history + new message to Gemini
4. AI generates response
5. Saves messages to database
```

**Cost:**
- Each message includes conversation history
- More tokens per request
- Full control over cached data

## Admin Dashboard

### Accessing Settings

1. Go to **Admin Dashboard**
2. Click **System Settings** tab
3. You'll see the **AI Caching Mode** section

### Toggle Options

#### Option 1: Gemini Built-in Cache (Recommended)
```
✅ Pros:
  - ~90% cost reduction on follow-ups
  - Faster responses
  - No database storage needed for context
  - Automatic cache management by Gemini

📊 Cost Example:
  - First question: $0.001
  - Follow-up: $0.0001 (90% cheaper!)
```

#### Option 2: Own Database Cache (Legacy)
```
✅ Pros:
  - Full control over cached data
  - Conversation stored in your database
  - No dependency on Gemini cache
  - Familiar existing behavior

📊 Cost Example:
  - Each message: $0.001
  - No cost reduction on follow-ups
```

### Making Changes

1. Select your preferred cache mode
2. Click **Save Settings**
3. Changes take effect immediately for new conversations
4. Existing conversations continue with their original mode

## Database Schema

### `system_settings` table
Stores the cache mode toggle:
```sql
{
  setting_key: 'ai_cache_mode',
  setting_value: { useGeminiCache: true }  -- or false
}
```

### `gemini_cache_metadata` table
Tracks Gemini caches (only used when `useGeminiCache = true`):
```sql
{
  cache_name: 'exam_abc123_q5',
  exam_paper_id: 'abc123',
  question_number: '5',
  gemini_cache_name: 'cachedContents/xyz789',
  expires_at: '2025-10-21T12:00:00Z',
  use_count: 15,
  image_count: 2
}
```

## API Response

The edge function now returns cache metadata:

```typescript
{
  answer: "Here's the solution...",
  model: "gemini-2.0-flash-exp",
  cacheMode: "gemini",  // or "own"
  cacheInfo: {
    cacheName: "cachedContents/xyz789",
    cacheCreated: false,
    cacheReused: true
  },
  tokenUsage: {
    promptTokens: 1234,
    completionTokens: 567,
    totalTokens: 1801,
    estimatedCost: 0.00015
  }
}
```

## Cache Lifecycle

### Gemini Cache

**Creation:**
- Created on first question for each exam question
- TTL: 1 hour (3600 seconds)
- Contains: system prompt + question prompt + images

**Reuse:**
- Follow-up questions on same question reuse cache
- Cache automatically refreshed on each use
- Track usage count in database

**Expiration:**
- After 1 hour of inactivity
- Automatically cleaned up by Gemini
- Database metadata cleaned by cron job

### Own Cache

**Storage:**
- All messages stored in `conversation_messages` table
- Loaded on follow-up questions
- No automatic expiration

## Cost Comparison

### Example: 5 questions, 3 follow-ups each

**Gemini Cache Mode:**
```
5 first questions × $0.001 = $0.005
15 follow-ups × $0.0001 = $0.0015
Total: $0.0065
```

**Own Cache Mode:**
```
5 first questions × $0.001 = $0.005
15 follow-ups × $0.001 = $0.015
Total: $0.020
```

**💰 Savings: ~67% reduction with Gemini cache**

## Migration Notes

### Switching from Own → Gemini Cache

✅ Safe to switch at any time
- New conversations will use Gemini cache
- Old conversations continue with own cache
- Conversation history preserved

### Switching from Gemini → Own Cache

✅ Safe to switch at any time
- New conversations will use own cache
- Existing Gemini caches will expire naturally
- Conversation history preserved

## Important Notes

### Conversations Always Saved

⚠️ **Regardless of cache mode, ALL conversations are ALWAYS saved to your database**

This means:
- Users can see their conversation history
- You have a complete audit trail
- Can revert to own cache mode anytime
- Cache mode only affects HOW context is sent to AI

### Cache Mode Detection

The edge function automatically:
1. Reads cache mode from `system_settings` table
2. Switches logic based on mode
3. Falls back to own cache if setting not found
4. Logs which mode is being used

### Performance

**Gemini Cache:**
- Faster response times (less data transfer)
- Lower latency on follow-ups
- Recommended for production

**Own Cache:**
- Slightly higher latency
- More database queries
- Good for testing/debugging

## Monitoring

### Check Cache Usage

```sql
-- View Gemini cache statistics
SELECT
  exam_paper_id,
  question_number,
  gemini_cache_name,
  use_count,
  expires_at,
  created_at
FROM gemini_cache_metadata
WHERE expires_at > NOW()
ORDER BY use_count DESC;
```

### View Cache Mode Setting

```sql
-- Check current cache mode
SELECT setting_value
FROM system_settings
WHERE setting_key = 'ai_cache_mode';
```

### Token Usage Logs

```sql
-- Compare costs between modes
SELECT
  DATE(created_at) as date,
  is_follow_up,
  AVG(total_tokens) as avg_tokens,
  AVG(estimated_cost) as avg_cost
FROM token_usage_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), is_follow_up
ORDER BY date DESC;
```

## Troubleshooting

### Cache not being reused?

1. Check if cache expired (1-hour TTL)
2. Verify `question_number` matches exactly
3. Check `gemini_cache_metadata` table for entry
4. Look at edge function logs for cache lookup

### High costs still?

1. Verify cache mode is set to Gemini in settings
2. Check edge function logs show "Gemini cache mode"
3. Ensure follow-up questions are detected (`isFollowUp = true`)
4. Verify `lastQuestionNumber` matches `questionNumber`

### Cache creation failing?

1. Check Gemini API key is valid
2. Verify images are being sent correctly
3. Check edge function logs for errors
4. Ensure database migrations ran successfully

## Best Practices

1. **Use Gemini Cache in Production**
   - Significant cost savings
   - Better user experience
   - Automatic cache management

2. **Use Own Cache for Testing**
   - Full visibility into cached data
   - Easier debugging
   - Complete control

3. **Monitor Cache Usage**
   - Review `gemini_cache_metadata` table weekly
   - Check token usage logs
   - Optimize based on patterns

4. **Keep Conversations Saved**
   - Never disable conversation saving
   - Essential for user history
   - Required for both cache modes

## Support

For issues or questions:
1. Check edge function logs in Supabase
2. Review `system_settings` table
3. Verify migrations applied
4. Test with both cache modes

## Summary

The dual cache system gives you:
- ✅ Flexibility to choose caching strategy
- ✅ Massive cost savings with Gemini cache
- ✅ Backward compatibility with own cache
- ✅ Full conversation history regardless of mode
- ✅ Easy toggle in admin dashboard
- ✅ No breaking changes to existing functionality

**Recommendation:** Use Gemini Cache mode for production to maximize cost savings while maintaining excellent user experience.
