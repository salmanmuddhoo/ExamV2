# Conversation History Optimization

## Problem Statement
Sending entire conversation history to the AI for every request is costly and inefficient, especially when a student switches between different questions.

## Solution: Question-Specific History

The system now loads **ONLY** the conversation history relevant to the current question being discussed.

## How It Works

### Database Structure

Each message is tagged with its `question_number`:

```sql
conversation_messages
├── id
├── conversation_id
├── role (user/assistant)
├── content
├── question_number  ← "2", "5", etc. (the question being discussed)
├── has_images
└── created_at
```

### Backend Logic (Edge Function)

```typescript
// 1. Load history ONLY if it's a follow-up question
if (isFollowUp) {
  conversationHistory = await loadConversationHistory(
    supabase,
    conversationId,
    examPaperId,
    userId,
    detectedQuestionNumber  // Filter by this question only
  );
} else {
  // New question: No history loaded
  conversationHistory = [];
}

// 2. Filter by question number in database query
async function loadConversationHistory(..., questionNumber) {
  const { data } = await supabase
    .from('conversation_messages')
    .eq('conversation_id', conversationId)
    .eq('question_number', questionNumber)  // ← KEY: Only this question
    .order('created_at', { ascending: true })
    .limit(10);
}
```

## Real-World Example

### Scenario: Student working through an exam

```
┌─────────────────────────────────────────────────────────────┐
│ Student Action: "Question 2"                                │
│ System Response:                                            │
│   - Question detected: 2                                    │
│   - Is follow-up? NO (new question)                         │
│   - History loaded: NONE                                    │
│   - Images sent: 2                                          │
│   - Message saved with question_number = "2"                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Student Action: "Can you explain step 3?"                   │
│ System Response:                                            │
│   - Question detected: 2                                    │
│   - Last question: 2                                        │
│   - Is follow-up? YES (2 == 2)                              │
│   - History loaded: Q2 messages only (2 messages)           │
│   - Images sent: 0 (uses cached context)                    │
│   - Message saved with question_number = "2"                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Student Action: "What's the formula again?"                 │
│ System Response:                                            │
│   - Question detected: 2                                    │
│   - Last question: 2                                        │
│   - Is follow-up? YES (2 == 2)                              │
│   - History loaded: Q2 messages only (4 messages)           │
│   - Images sent: 0                                          │
│   - Message saved with question_number = "2"                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Student Action: "Question 5"                                │
│ System Response:                                            │
│   - Question detected: 5                                    │
│   - Last question: 2                                        │
│   - Is follow-up? NO (5 != 2)                               │
│   - History loaded: NONE (new question, Q2 history ignored) │
│   - Images sent: 2                                          │
│   - Message saved with question_number = "5"                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Student Action: "Show me the working"                       │
│ System Response:                                            │
│   - Question detected: 5                                    │
│   - Last question: 5                                        │
│   - Is follow-up? YES (5 == 5)                              │
│   - History loaded: Q5 messages only (2 messages)           │
│   - Images sent: 0                                          │
│   - Message saved with question_number = "5"                │
└─────────────────────────────────────────────────────────────┘
```

## Cost Savings

### Without Optimization (Old Approach)
```
Question 2: 3 exchanges (6 messages)
Question 5: 2 exchanges (4 messages)
Total: 10 messages in conversation

When student asks follow-up on Question 5:
- Loads ALL 10 messages (Q2 + Q5)
- Sends 10 messages to AI
- Cost: ~500 tokens for history
```

### With Optimization (New Approach)
```
Question 2: 3 exchanges (6 messages) with question_number="2"
Question 5: 2 exchanges (4 messages) with question_number="5"
Total: 10 messages in conversation

When student asks follow-up on Question 5:
- Loads ONLY Q5 messages (4 messages)
- Sends 4 messages to AI
- Cost: ~200 tokens for history
💰 60% reduction in history tokens!
```

## Benefits

### 1. Reduced Token Costs
- Only relevant messages sent to AI
- No wasted tokens on unrelated question history
- Scales linearly, not exponentially

### 2. Better Context
- AI focuses only on current question discussion
- No confusion from unrelated question context
- More accurate and relevant responses

### 3. Improved Performance
- Less data to load from database
- Smaller payloads to AI API
- Faster response times

### 4. Cleaner Conversation Flow
- Each question has its own context
- Switching questions starts fresh
- Natural conversation boundaries

## Implementation Details

### Frontend (ExamViewer.tsx)
```typescript
// Tracks last question number
const [lastQuestionNumber, setLastQuestionNumber] = useState<string | null>(null);

// Sends lastQuestionNumber to backend
requestBody.lastQuestionNumber = lastQuestionNumber;

// Updates when new question is detected
setLastQuestionNumber(questionNumber);
```

### Backend (exam-assistant/index.ts)
```typescript
// Detects follow-up
const isFollowUp = extractedQuestionNumber && lastQuestionNumber &&
                   extractedQuestionNumber === lastQuestionNumber;

// Conditional history loading
if (isFollowUp) {
  // Load only this question's history
  conversationHistory = await loadConversationHistory(
    supabase,
    conversationId,
    examPaperId,
    userId,
    detectedQuestionNumber  // Filter parameter
  );
} else {
  // New question: empty history
  conversationHistory = [];
}
```

## Logging Output

### New Question
```
🆕 NEW QUESTION: Starting fresh context for Question 5
💰 COST OPTIMIZATION: No history loaded (fresh question = no unnecessary context)
```

### Follow-up Question
```
📚 FOLLOW-UP: Loaded 4 previous messages for Question 5
💰 COST OPTIMIZATION: Reusing 4 cached messages instead of re-sending images
```

## Complete Flow Diagram

```
User asks          Question      Last Q    Follow-up?   History Loaded    Images Sent
─────────────────  ────────────  ────────  ───────────  ────────────────  ───────────
"Question 2"       2             null      NO           None              2
"Explain step 3"   2             2         YES          Q2 only (2 msgs)  0
"Show working"     2             2         YES          Q2 only (4 msgs)  0
"Question 5"       5             2         NO           None              2
"Clarify that"     5             5         YES          Q5 only (2 msgs)  0
"More detail"      5             5         YES          Q5 only (4 msgs)  0
"Question 1"       1             5         NO           None              2
```

## Key Takeaway

**The system maintains full conversation history in the database for the user to view, but only sends question-specific history to the AI, dramatically reducing costs while improving context quality.**
