# AI Agent-Based Calendar Conflict Detection

## Overview

The study plan generation system now includes an intelligent AI agent that uses **multi-step reasoning with function calling** to handle calendar conflicts incrementally, rather than loading all calendar data upfront.

## Problem Statement

**Previous Approach:**
- When generating a study plan, the system fetched ALL existing events in the date range
- All events were passed to the AI in a single prompt as "busy slots"
- With 3 study plans × 70 sessions × 8 subjects = 1,680+ sessions, this became extremely inefficient
- Huge prompts consumed excessive tokens and risked hitting context limits

**New Approach:**
- AI agent checks calendar availability **incrementally** as it plans each session
- Only queries specific time slots when needed
- Uses function calling to interact with the calendar dynamically
- Scales efficiently regardless of existing event count

## Architecture

### Components

1. **Agent Tools** (`agent-tools.ts`)
   - `check_time_slot()` - Check if a specific date/time has conflicts
   - `get_busy_periods()` - Get days with high event density (sorted by least busy first)
   - `get_conflicting_sessions()` - Get existing sessions for same subject/grade
   - `schedule_session()` - Schedule a session after confirming it's free

2. **Agent Executor** (`agent-executor.ts`)
   - Implements multi-step reasoning loop
   - Supports Claude (Anthropic), Gemini (Google), and OpenAI
   - Executes function calls and manages conversation state
   - Tracks token usage and cost across iterations

3. **Integration Layer** (`agent-integration.ts`)
   - Integrates agent into existing endpoint
   - Provides backward compatibility with legacy mode
   - Auto-enables agent mode when needed (>= 50 existing events)

4. **Main Endpoint** (`index.ts`)
   - Routes to agent mode or legacy mode
   - Handles both generation approaches seamlessly

### Agent Workflow

```
1. AI receives initial context:
   - Subject, grade, date range
   - Preferred days and times
   - Chapters to cover
   - Session count to schedule

2. AI calls get_busy_periods()
   → System returns days sorted by event count (least busy first)

3. AI calls get_conflicting_sessions()
   → System returns existing sessions for same subject/grade

4. For each session to schedule:
   a. AI reasons about best date/time based on:
      - Chapter progression (sequential order)
      - Less busy days
      - Preferred times
      - Even distribution across date range

   b. AI calls check_time_slot(date, start_time, end_time)
      → System returns conflict info

   c. If conflict exists:
      - AI tries different time on same day
      - Or selects next available day
      - Repeats check_time_slot()

   d. When free slot found:
      AI calls schedule_session(session_details)
      → Session is recorded

   e. Repeat for next session

5. When all sessions scheduled:
   AI provides final summary
   → Events are inserted into database
```

## Usage

### Automatic Activation

Agent mode **automatically activates** when:
- User has >= 50 existing events in the date range
- This prevents sending huge prompts to the AI

```typescript
// Threshold can be configured in agent-integration.ts
export function shouldUseAgentMode(
  existingEventCount: number,
  threshold: number = 50 // Configurable
): boolean {
  return existingEventCount >= threshold;
}
```

### Manual Activation

You can explicitly enable agent mode via the API request:

```typescript
POST /functions/v1/generate-study-plan

{
  "schedule_id": "...",
  "user_id": "...",
  "subject_id": "...",
  "grade_id": "...",
  "study_duration_minutes": 60,
  "selected_days": ["monday", "wednesday", "friday"],
  "preferred_times": ["morning"],
  "start_date": "2025-01-15",
  "end_date": "2025-03-15",
  "use_agent_mode": true  // ← Explicitly enable agent mode
}
```

### Frontend Integration

Update `StudyPlanWizard.tsx` to allow users to choose agent mode:

```tsx
// Add to step 4 (finalize step)
<div className="mb-4">
  <label className="flex items-center space-x-2">
    <input
      type="checkbox"
      checked={useAgentMode}
      onChange={(e) => setUseAgentMode(e.target.checked)}
    />
    <span>
      Use AI Agent (recommended for complex schedules)
    </span>
  </label>
  <p className="text-sm text-gray-500 mt-1">
    The AI agent checks your calendar incrementally for better conflict detection
  </p>
</div>

// Include in API request
const response = await supabase.functions.invoke('generate-study-plan', {
  body: {
    // ... other parameters
    use_agent_mode: useAgentMode,
  },
});
```

## Response Format

Agent mode returns additional information:

```json
{
  "success": true,
  "message": "Successfully generated 42 study sessions using AI agent",
  "schedule_id": "...",
  "events_count": 42,
  "token_usage": {
    "prompt_tokens": 15000,
    "completion_tokens": 8000,
    "total_tokens": 23000,
    "cost_adjusted_tokens": 25000
  },
  "cost_usd": 0.045,
  "agent_mode": true,
  "reasoning_steps": 12
}
```

## Benefits

### 1. **Scalability**
- Works efficiently with any number of existing events
- No prompt size limitations
- Incremental querying reduces memory footprint

### 2. **Accuracy**
- Real-time conflict checking for each session
- Can handle complex calendar scenarios
- More intelligent time slot selection

### 3. **Transparency**
- Reasoning steps are logged
- Users can see how AI made decisions
- Better debugging and monitoring

### 4. **Cost Optimization**
- Only fetches data when needed
- Reduces token usage compared to large prompts with 1000+ events
- Cost-effective for users with many existing sessions

## Configuration

### Adjust Agent Mode Threshold

Edit `agent-integration.ts`:

```typescript
// Default: 50 events
export function shouldUseAgentMode(
  existingEventCount: number,
  threshold: number = 50  // Change this value
): boolean {
  return existingEventCount >= threshold;
}
```

### Adjust Max Iterations

Edit `agent-integration.ts`:

```typescript
const agentResult = await executeAgent(
  config,
  context,
  20  // Max iterations - increase for complex schedules
);
```

Higher iterations allow more retries if conflicts are found, but increase cost.

### Model Selection

The agent respects user's AI model preference from their subscription:
- Free tier: Gemini 1.5 Flash
- Premium tier: Claude 3.5 Sonnet or GPT-4

All models support function calling.

## Monitoring

### Logs

Agent mode provides detailed logging:

```
🤖 AI AGENT MODE ENABLED
✅ Agent mode auto-enabled (65 existing events >= 50 threshold)
📊 Using multi-step reasoning with incremental calendar checks

=== Agent Iteration 1 ===
AI Reasoning: Let me start by understanding the calendar...
Executing function: get_busy_periods
Function result: {...}

=== Agent Iteration 2 ===
AI Reasoning: I see that Mondays have 3 events, Wednesdays have 1...
Executing function: check_time_slot
Function result: {"has_conflict": false, ...}

... (continues for each iteration)

✅ AGENT GENERATION COMPLETED
📝 Sessions generated: 42
💬 Reasoning steps: 12
🪙 Token usage: 15000 input + 8000 output
💰 Cost: $0.045000
```

### Database Tracking

Token usage logs include agent-specific metadata:

```sql
SELECT
  purpose,
  provider,
  total_tokens,
  estimated_cost,
  metadata->>'agent_mode' as agent_mode,
  metadata->>'reasoning_steps' as reasoning_steps
FROM token_usage_logs
WHERE purpose = 'study_plan_generation_agent';
```

## Testing

### Test Case 1: Empty Calendar

```bash
# Should use legacy mode (no conflicts to manage)
curl -X POST 'http://localhost:54321/functions/v1/generate-study-plan' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "schedule_id": "...",
    "user_id": "...",
    ...
  }'
```

### Test Case 2: Crowded Calendar (50+ events)

```bash
# Should auto-enable agent mode
curl -X POST 'http://localhost:54321/functions/v1/generate-study-plan' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "schedule_id": "...",
    "user_id": "...",
    ...
  }'
```

### Test Case 3: Manual Agent Mode

```bash
# Explicitly enable agent mode
curl -X POST 'http://localhost:54321/functions/v1/generate-study-plan' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "schedule_id": "...",
    "user_id": "...",
    "use_agent_mode": true,
    ...
  }'
```

## Troubleshooting

### Agent Times Out

Increase max iterations:

```typescript
// agent-integration.ts
const agentResult = await executeAgent(
  config,
  context,
  30  // Increased from 20
);
```

### Sessions Not Sequential

Check chapter distribution logic in `agent-integration.ts`:

```typescript
const sessionsPerChapter = Math.floor(totalSessions / chapters.length);
const remainingSessions = totalSessions % chapters.length;
```

### Function Call Failures

Check agent tool implementations in `agent-tools.ts`. Ensure database queries are correct.

### High Token Usage

Agent mode may use more tokens than legacy mode for small calendars. The threshold (50 events) balances this tradeoff.

## Future Enhancements

1. **Parallel Session Scheduling**
   - Schedule multiple sessions in parallel when no dependencies
   - Reduce iteration count

2. **Learning from User Preferences**
   - Track which times user prefers
   - Bias scheduling toward successful patterns

3. **Conflict Resolution Strategies**
   - Let AI suggest rescheduling existing events
   - Provide multiple scheduling options

4. **Real-time Streaming**
   - Stream reasoning steps to frontend
   - Show progress as agent plans

5. **Batch Function Calls**
   - Check multiple time slots in single call
   - Further reduce iterations

## API Reference

See the main function definitions in `agent-tools.ts`:

- `checkTimeSlot()` - Returns `ConflictInfo`
- `getBusyPeriods()` - Returns `BusyPeriod[]`
- `getConflictingSessions()` - Returns session array
- `getAgentFunctionDefinitions()` - Returns OpenAI-compatible function schemas

## Support

For issues or questions:
1. Check logs in Supabase Edge Functions console
2. Review token usage in `token_usage_logs` table
3. Test with `use_agent_mode: false` to compare with legacy mode
4. Open GitHub issue with:
   - Schedule ID
   - Event count
   - AI model used
   - Error logs
