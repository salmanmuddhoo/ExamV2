# AI Cost Optimization Flow

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         STUDENT INTERACTION                          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ "Help with Question 2"
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (ExamViewer.tsx)                        │
│                                                                       │
│  1. extractQuestionNumber()  →  "2"                                  │
│  2. Check if follow-up?      →  No                                   │
│  3. fetchQuestionData("2")   →  Check cache first                    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Query Database
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE (exam_questions)                         │
│                                                                       │
│  SELECT image_urls, marking_scheme_text, ocr_text                    │
│  FROM exam_questions                                                 │
│  WHERE exam_paper_id = ? AND question_number = '2'                   │
│                                                                       │
│  Returns:                                                            │
│  - image_urls: ["url1.jpg", "url2.jpg"]  (2 images)                 │
│  - marking_scheme_text: "Answer: 45°..."  (TEXT, not images)        │
│  - ocr_text: "Question 2: Calculate..."                              │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Return data
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (ExamViewer.tsx)                        │
│                                                                       │
│  4. Convert image URLs to base64                                     │
│  5. Cache the data (for reuse)                                       │
│  6. Build optimized request:                                         │
│     {                                                                │
│       examPaperImages: [base64_1, base64_2],  // 2 images           │
│       markingSchemeText: "Answer: 45°...",    // TEXT                │
│       questionText: "Question 2: Calculate...",                      │
│       questionNumber: "2"                                            │
│     }                                                                │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ POST request
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              EDGE FUNCTION (exam-assistant/index.ts)                 │
│                                                                       │
│  1. Receive request with 2 images + marking scheme text             │
│  2. Build prompt with:                                               │
│     - System instructions                                            │
│     - Question context                                               │
│     - Marking scheme (internal use only)                             │
│     - Exam images (inline)                                           │
│  3. Send to Gemini API                                               │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ API call
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        GEMINI API (Google)                           │
│                                                                       │
│  Process: 2 images + text prompt                                     │
│  Cost: Based on tokens + image count                                 │
│                                                                       │
│  💰 SAVINGS: 2 images vs 35 images = ~94% cost reduction            │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Response
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (ExamViewer.tsx)                        │
│                                                                       │
│  Display AI response to student                                      │
│  Update lastQuestionNumber = "2"                                     │
│  Save to conversation history                                        │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Follow-up Question Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         STUDENT INTERACTION                          │
│                                                                       │
│  "Can you explain step 3?" (Follow-up on Question 2)                │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (ExamViewer.tsx)                        │
│                                                                       │
│  1. extractQuestionNumber()     →  "2"                               │
│  2. lastQuestionNumber          →  "2"                               │
│  3. isFollowUp?                 →  YES (same question)               │
│  4. Build request:                                                   │
│     {                                                                │
│       examPaperImages: [],           // EMPTY (no images)            │
│       markingSchemeText: "",         // EMPTY                        │
│       lastQuestionNumber: "2",                                       │
│       conversationId: "abc123"       // For context                  │
│     }                                                                │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ POST request (no images)
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              EDGE FUNCTION (exam-assistant/index.ts)                 │
│                                                                       │
│  1. Detect isFollowUp = true                                         │
│  2. Load conversation history from database                          │
│  3. Build prompt with:                                               │
│     - Previous messages (images already in context)                  │
│     - New question                                                   │
│  4. Send to Gemini API (reuse existing context)                      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ API call (conversation context)
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        GEMINI API (Google)                           │
│                                                                       │
│  Process: 0 NEW images (uses existing context)                       │
│  Cost: Only text tokens (no image processing)                        │
│                                                                       │
│  💰 SAVINGS: 0 images vs 2 images = 100% image cost reduction       │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Response
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (ExamViewer.tsx)                        │
│                                                                       │
│  Display AI response to student                                      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Cost Comparison Table

| Scenario | Old Approach | New Approach | Savings |
|----------|-------------|--------------|---------|
| First question (Q2) | 35 images | 2 images | 94% |
| Follow-up on Q2 | 35 images | 0 images | 100% |
| New question (Q5) | 35 images | 2 images | 94% |
| Average per question | 35 images | 1-2 images | 94-97% |

## Key Optimization Points

### 1. Question-Specific Retrieval
❌ **Before**: Load entire PDF (35 pages)
✅ **After**: Load only Question 2 pages (2 pages)

### 2. Text-Based Marking Schemes
❌ **Before**: Convert marking scheme PDF to images (15 images)
✅ **After**: Use OCR text from marking scheme (0 images)

### 3. Intelligent Caching
❌ **Before**: Fetch from database every time
✅ **After**: Cache question data in memory

### 4. Conversation Context
❌ **Before**: Re-send all images for follow-ups
✅ **After**: Reuse conversation context (0 new images)

## Implementation Checklist

✅ Database has question-specific data (exam_questions table)
✅ Frontend fetches only relevant question data
✅ Frontend converts marking scheme images to text
✅ Frontend implements caching mechanism
✅ Frontend detects follow-up questions
✅ Edge function accepts markingSchemeText parameter
✅ Edge function uses conversation context
✅ Build passes without errors
