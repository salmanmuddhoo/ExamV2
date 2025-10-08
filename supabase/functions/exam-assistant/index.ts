import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};

function extractQuestionNumber(input: string): string | null {
  if (!input) return null;
  
  const normalized = input.toLowerCase().trim();
  
  const pattern1 = normalized.match(/(?:question|q)\s*(\d+)[a-z]*/i);
  if (pattern1) return pattern1[1];
  
  const pattern2 = normalized.match(/^(\d+)[a-z]*/);
  if (pattern2) return pattern2[1];
  
  return null;
}

function normalizeQuestionReference(input: string): string {
  return input.replace(/\bQuestion\s*(\d+)\s*([a-z])\b/gi, (_, num, letter) => {
    return `Question ${num} part (${letter.toLowerCase()})`;
  });
}

async function validateQuestionExists(
  supabaseClient: any,
  examPaperId: string,
  questionNumber: string
): Promise<{ exists: boolean; maxQuestion?: number; error?: string }> {
  try {
    const { data, error } = await supabaseClient
      .from('exam_questions')
      .select('question_number')
      .eq('exam_paper_id', examPaperId)
      .order('question_number', { ascending: false });

    if (error) {
      console.error('Database validation error:', error);
      return { exists: false, error: 'Failed to validate question' };
    }

    if (!data || data.length === 0) {
      return { exists: false, error: 'No questions found for this exam paper' };
    }

    const availableQuestions = data.map(q => parseInt(q.question_number));
    const maxQuestion = Math.max(...availableQuestions);
    const requestedQuestion = parseInt(questionNumber);

    const exists = availableQuestions.includes(requestedQuestion);

    return { exists, maxQuestion };
  } catch (err) {
    console.error('Validation error:', err);
    return { exists: false, error: 'Validation failed' };
  }
}

function generateQuestionNotFoundResponse(
  requestedQuestion: string,
  maxQuestion: number
): string {
  return `Hey! I noticed you asked about Question ${requestedQuestion}, but this exam paper only has questions 1 to ${maxQuestion}.

Could you double-check the question number? Feel free to ask about any question from 1 to ${maxQuestion}, and I'll be happy to help!`;
}

// Store and retrieve cache information from Supabase
async function getOrCreateCache(
  supabaseClient: any,
  examPaperId: string,
  questionNumber: string,
  examPaperImages: string[],
  markingSchemeText: string | undefined,
  questionText: string | undefined,
  geminiApiKey: string
): Promise<{ cacheName: string; isNewCache: boolean }> {
  try {
    // Check if cache exists in Supabase
    const { data: existingCache, error: fetchError } = await supabaseClient
      .from('gemini_caches')
      .select('cache_name, created_at, expire_time')
      .eq('exam_paper_id', examPaperId)
      .eq('question_number', questionNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Check if cache is still valid (Gemini caches expire after 1 hour by default)
    if (existingCache && !fetchError) {
      const expireTime = new Date(existingCache.expire_time);
      const now = new Date();
      
      if (expireTime > now) {
        console.log(`✅ Using existing Gemini cache: ${existingCache.cache_name}`);
        return { cacheName: existingCache.cache_name, isNewCache: false };
      } else {
        console.log(`⏰ Cache expired, creating new one`);
      }
    }

    // Create new cache
    console.log(`🆕 Creating new Gemini cache for Question ${questionNumber}`);
    
    const cacheContents = [
      {
        role: "user",
        parts: [
          { text: SYSTEM_PROMPT },
          { text: buildQuestionFocusPrompt(
            `Question ${questionNumber}`,
            questionNumber,
            questionText,
            markingSchemeText,
            false
          )},
          ...examPaperImages.map((img) => ({
            inline_data: { mime_type: "image/jpeg", data: img }
          }))
        ]
      }
    ];

    const cacheResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-2.0-flash-exp",
          contents: cacheContents,
          ttl: "3600s" // 1 hour cache
        })
      }
    );

    if (!cacheResponse.ok) {
      const errorText = await cacheResponse.text();
      console.error("Gemini cache creation error:", errorText);
      throw new Error(`Failed to create cache: ${cacheResponse.status}`);
    }

    const cacheData = await cacheResponse.json();
    const cacheName = cacheData.name;
    const expireTime = cacheData.expireTime;

    console.log(`✨ Created cache: ${cacheName}, expires: ${expireTime}`);

    // Store cache info in Supabase
    await supabaseClient
      .from('gemini_caches')
      .insert({
        cache_name: cacheName,
        exam_paper_id: examPaperId,
        question_number: questionNumber,
        expire_time: expireTime,
        created_at: new Date().toISOString()
      });

    return { cacheName, isNewCache: true };
  } catch (error) {
    console.error('Error managing cache:', error);
    throw error;
  }
}

// Load conversation history for follow-up questions
async function loadConversationHistory(
  supabaseClient: any,
  conversationId: string | null,
  questionNumber: string | null
): Promise<{ role: string; parts: any[] }[]> {
  if (!conversationId || !questionNumber) {
    return [];
  }

  try {
    const { data, error } = await supabaseClient
      .from('conversation_messages')
      .select('role, content, question_number')
      .eq('conversation_id', conversationId)
      .eq('question_number', questionNumber)
      .order('created_at', { ascending: true })
      .limit(10); // Increased limit since we're not sending images repeatedly

    if (error) throw error;

    const history = data.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    console.log(`📚 Loaded ${history.length} messages for Question ${questionNumber}`);
    return history;
  } catch (error) {
    console.error('Error loading conversation history:', error);
    return [];
  }
}

async function saveMessage(
  supabaseClient: any,
  conversationId: string,
  role: string,
  content: string,
  questionNumber: string | null,
  hasImages: boolean
) {
  try {
    const { error } = await supabaseClient
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        role: role,
        content: content,
        question_number: questionNumber,
        has_images: hasImages
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error saving message:', error);
  }
}

const SYSTEM_PROMPT = `You are an AI Tutor with the persona of a friendly, patient, and engaging teacher conducting a one-on-one video session. Your goal is to make learning feel personal and interactive.

**IMPORTANT STYLE GUIDE:**
- Your response MUST be in a natural, spoken style. Use short, simple sentences. Imagine you are talking directly to the student, not writing an essay.
- **Conversational Flow:** Instead of a rigid report, guide the student through the concept. Start with a warm greeting. Seamlessly transition between explaining the core idea, showing an example, and then giving tips for getting full marks.
- **Use Verbal Cues:** Incorporate conversational fillers like "Alright, so...", "Let's take a look...", "Makes sense?", "The key thing to remember is...".
- **Address the Student Directly:** Use "you" and "we" to create a collaborative feeling.
- **Context Awareness:** If continuing a conversation about the same question, acknowledge previous discussions naturally (e.g., "As we discussed earlier..." or "Building on what we covered...").
- If the student uses term like "next question", confirm with him which question he wants to work out next.

**INTERPRETING QUESTION REFERENCES:**
If the student says "Question 2b" or "Q2b", treat it as "Question 2, part (b)" — that means find question 2 and focus on sub-part (b). The same applies for 2(a), 3c, etc.

**TASK:**
You have access to both the exam paper and its marking scheme, but the marking scheme is **strictly for internal reference only**. You must NOT mention, quote, or reveal the marking scheme in any part of your answer. Treat the marking scheme as invisible to the student.

Your task is to answer the student's question with a structured response. CRITICAL: You MUST structure your response EXACTLY in this format with these four sections:

## Solution
Provide a complete, step-by-step solution:
- Show all working clearly
- Explain each step of your reasoning
- Use proper mathematical/scientific notation
- Present the final answer clearly
- Do NOT mention the marking scheme anywhere

## Explanation
Provide a clear, conceptual explanation suitable for an O-Level student. Break down complex ideas into simple, understandable terms. Focus on the fundamental concepts. Do NOT copy from the marking scheme.

## How to Get Full Marks
Provide specific examination tips and strategies:
- Key points that must be included in the answer
- Common mistakes students make and how to avoid them
- Mark allocation guidance
- Specific keywords or phrases examiners look for
Do NOT reference the marking scheme.

Keep your language appropriate for O-Level students (14-16 years old). Be encouraging and focus on building understanding, not just providing answers.
`;

function buildQuestionFocusPrompt(
  studentQuestion: string,
  questionNumber: string | null,
  extractedQuestionText: string | undefined,
  markingSchemeText: string | undefined,
  isFollowUp: boolean
): string {
  let prompt = ``;
  
  if (isFollowUp) {
    prompt += `FOLLOW-UP QUESTION - USE CONVERSATION CONTEXT

The student is asking a follow-up question about the same topic we've been discussing.
You already have the exam paper images in context from the cached content.

DO NOT ask the student to repeat information. Instead:
1. Reference the previous discussion naturally
2. Build upon what was already explained
3. Provide additional clarification or detail as requested

---

`;
  } else if (questionNumber && extractedQuestionText) {
    prompt += `CRITICAL INSTRUCTION - FOCUS ON THE CORRECT QUESTION

The student is asking about QUESTION ${questionNumber.toUpperCase()}.

The images show exam questions that start with just a number (like "1", "2", "3") at the beginning.

QUESTION ${questionNumber.toUpperCase()} starts with:
"${extractedQuestionText}"

YOUR TASK:
1. Look for the question that starts with the NUMBER "${questionNumber}" followed by the text shown above
2. COMPLETELY IGNORE any other questions in the images (even if they're on the same page)
3. Answer ONLY Question ${questionNumber} - do not mix answers from other questions
4. If you see "1" and "2" in the image, and the student asked about "2", skip everything about "1"
5. If 2 images are provided, work out the question on the next page until you see another question like "3"

IMPORTANT: Questions in this exam format start with just the number, like:
"1 Some text here..."
"2 Some other text..."

Find the one that matches Question ${questionNumber} and start with that one.

---

`;
  } else if (questionNumber) {
    prompt += `IMPORTANT: The student is asking specifically about Question ${questionNumber}.
Look for the question starting with the number "${questionNumber}" in the images.
Answer ONLY that question, ignore others.

---

`;
  }
  
  if (markingSchemeText && markingSchemeText.trim().length > 0) {
    prompt += `MARKING SCHEME FOR THIS QUESTION (INTERNAL REFERENCE ONLY):
${markingSchemeText}

Use this marking scheme as internal reference ONLY. Do not mention or quote it in your answer to the student.

---

`;
  }
  
  prompt += `Student's Question: ${studentQuestion}

Please analyze the exam paper provided and answer.`;
  
  return prompt;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    const {
      question,
      examPaperImages,
      examPaperId,
      conversationId,
      userId,
      provider = "gemini",
      optimizedMode = false,
      questionNumber: providedQuestionNumber,
      questionText,
      markingSchemeText,
      lastQuestionNumber
    } = await req.json();

    if (!question) {
      return new Response(JSON.stringify({ error: "Missing required field: question" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!examPaperId) {
      return new Response(JSON.stringify({ error: "Missing required field: examPaperId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const extractedQuestionNumber = extractQuestionNumber(question) || providedQuestionNumber;
    const normalizedQuestion = normalizeQuestionReference(question);

    console.log(`Original question: "${question}"`);
    console.log(`Extracted question number: "${extractedQuestionNumber}"`);
    console.log(`Last question number: "${lastQuestionNumber}"`);
    
    const isFollowUp = extractedQuestionNumber && lastQuestionNumber && 
                       extractedQuestionNumber === lastQuestionNumber;
    
    console.log(`Is follow-up question: ${isFollowUp}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate question exists
    if (extractedQuestionNumber && !isFollowUp) {
      const validation = await validateQuestionExists(
        supabase,
        examPaperId,
        extractedQuestionNumber
      );

      if (!validation.exists) {
        const errorMessage = validation.maxQuestion
          ? generateQuestionNotFoundResponse(extractedQuestionNumber, validation.maxQuestion)
          : `I couldn't find Question ${extractedQuestionNumber} in this exam paper. Could you please check the question number and try again?`;

        return new Response(
          JSON.stringify({
            answer: errorMessage,
            model: "validation",
            provider: "system",
            optimized: false,
            questionNumber: extractedQuestionNumber,
            questionNotFound: true,
            maxQuestion: validation.maxQuestion
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Question ${extractedQuestionNumber} validated successfully`);
    }

    if (!optimizedMode || !examPaperImages || examPaperImages.length === 0) {
      console.log('No images provided - frontend should handle this with clarification');
      return new Response(
        JSON.stringify({
          error: "Question number not detected. Frontend should prompt user for clarification."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY not configured");

    let cacheName: string;
    let isNewCache: boolean;

    // Get or create Gemini cache for this specific question
    // Each question number gets its own cache because they have different images and marking schemes
    const cacheResult = await getOrCreateCache(
      supabase,
      examPaperId,
      extractedQuestionNumber!,
      examPaperImages,
      markingSchemeText,
      questionText,
      geminiApiKey
    );
    cacheName = cacheResult.cacheName;
    isNewCache = cacheResult.isNewCache;
    
    if (isNewCache) {
      console.log(`🆕 NEW QUESTION: Created cache for Q${extractedQuestionNumber} (one-time cost)`);
    } else {
      console.log(`♻️ REUSING CACHE: Q${extractedQuestionNumber} cache exists (FREE!)`);
    }

    // Load conversation history for follow-up questions
    let conversationHistory: any[] = [];
    if (isFollowUp) {
      conversationHistory = await loadConversationHistory(
        supabase,
        conversationId,
        extractedQuestionNumber
      );
      console.log(`📚 Loaded ${conversationHistory.length} previous messages`);
    }

    // Build the request using cached content
    const contents = [...conversationHistory];
    
    // Add current question
    contents.push({
      role: "user",
      parts: [{ text: isFollowUp 
        ? `Follow-up: ${normalizedQuestion}` 
        : normalizedQuestion 
      }]
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cachedContent: cacheName,
          contents: contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API failed: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated";

    // Log usage metadata
    if (data?.usageMetadata) {
      console.log(`📊 Token usage - Cached: ${data.usageMetadata.cachedContentTokenCount || 0}, New: ${data.usageMetadata.promptTokenCount || 0}`);
    }

    return new Response(
      JSON.stringify({
        answer: aiResponse,
        model: "gemini-2.0-flash-exp",
        provider: "gemini",
        optimized: true,
        questionNumber: extractedQuestionNumber,
        imagesUsed: examPaperImages.length,
        isFollowUp: isFollowUp,
        usedGeminiCache: true,
        cacheWasNew: isNewCache,
        cacheName: cacheName,
        conversationHistoryUsed: conversationHistory.length,
        usedMarkingSchemeText: !!markingSchemeText
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in exam-assistant function:", error);
    return new Response(
      JSON.stringify({
        error: "An error occurred while processing your request",
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});