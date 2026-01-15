import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { generateAIResponse, getSubjectAIModel, getUserAIModel, getDefaultAIModel, type AIModelConfig } from "./ai-providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};

// ========== CACHE MODE HELPERS ==========

// Helper to get cache mode and API keys from settings
async function getCacheModeAndKeys(supabaseClient: any): Promise<{
  useGeminiCache: boolean;
  cacheApiKey: string | null;
  legacyApiKey: string;
}> {
  try {
    // Get cache mode setting
    const { data: cacheData } = await supabaseClient
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'ai_cache_mode')
      .single();

    const useGeminiCache = (cacheData?.setting_value?.useGeminiCache) ?? false;
    console.log(`📦 Cache mode: ${useGeminiCache ? 'Gemini built-in cache' : 'Own database cache'}`);

    // Get Gemini cache API key from environment variable only
    let cacheApiKey: string | null = null;
    if (useGeminiCache) {
      cacheApiKey = Deno.env.get("GEMINI_CACHE_API_KEY") || null;
      if (cacheApiKey) {
        console.log('🔑 Using Gemini cache API key from environment variable');
      } else {
        console.log('⚠️ Gemini cache mode enabled but GEMINI_CACHE_API_KEY not set');
      }
    }

    // Get legacy API key (for own cache mode)
    const legacyApiKey = Deno.env.get("GEMINI_ASSISTANT_API_KEY") || Deno.env.get("GEMINI_API_KEY") || '';

    return {
      useGeminiCache,
      cacheApiKey,
      legacyApiKey
    };
  } catch (error) {
    console.error('Error fetching cache mode and keys:', error);
    return {
      useGeminiCache: false,
      cacheApiKey: null,
      legacyApiKey: Deno.env.get("GEMINI_ASSISTANT_API_KEY") || Deno.env.get("GEMINI_API_KEY") || ''
    };
  }
}

// Get existing Gemini cache for a question
async function getGeminiCache(
  supabaseClient: any,
  examPaperId: string,
  questionNumber: string
): Promise<{ cacheId: string; geminiCacheName: string; useCount: number } | null> {
  try {
    const { data, error } = await supabaseClient
      .rpc('get_gemini_cache_for_question', {
        p_exam_paper_id: examPaperId,
        p_question_number: questionNumber,
        p_cache_type: 'question_context'
      });

    if (error) throw error;

    if (data && data.length > 0 && !data[0].is_expired) {
      console.log(`♻️ Found existing Gemini cache: ${data[0].gemini_cache_name} (used ${data[0].use_count} times)`);
      return {
        cacheId: data[0].cache_id,
        geminiCacheName: data[0].gemini_cache_name,
        useCount: data[0].use_count
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching Gemini cache:', error);
    return null;
  }
}

// Create Gemini cache
async function createGeminiCache(
  geminiApiKey: string,
  systemPrompt: string,
  questionPrompt: string,
  imageData: string[],
  model: string = 'gemini-2.0-flash'
): Promise<string | null> {
  const cacheParts: any[] = [
    { text: systemPrompt },
    { text: questionPrompt }
  ];

  const imageParts = imageData.map((img) => ({
    inline_data: { mime_type: "image/jpeg", data: img }
  }));
  cacheParts.push(...imageParts);

  console.log(`🔨 Creating Gemini cache with ${imageData.length} images...`);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${model}`,
        contents: [{
          role: "user",
          parts: cacheParts
        }],
        ttl: "3600s"
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini cache creation error:", errorText);

    // Check if error is due to content being too small (< 4096 tokens)
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error?.message?.includes('too small') ||
          errorData.error?.message?.includes('min_total_token_count')) {
        console.log('⚠️ Content too small for caching (< 4096 tokens). Will use regular API call.');
        return null; // Signal to use regular API instead
      }
    } catch (e) {
      // Error parsing error message, continue with generic error
    }

    throw new Error(`Failed to create Gemini cache: ${response.status}`);
  }

  const data = await response.json();
  const cacheName = data.name;

  console.log(`✅ Created Gemini cache: ${cacheName}`);
  return cacheName;
}

// Save Gemini cache metadata to database
async function saveGeminiCacheMetadata(
  supabaseClient: any,
  examPaperId: string,
  questionNumber: string,
  geminiCacheName: string,
  systemPrompt: string,
  imageCount: number,
  model: string
) {
  try {
    const cacheName = `exam_${examPaperId}_q${questionNumber}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    const { error } = await supabaseClient
      .from('gemini_cache_metadata')
      .insert({
        cache_name: cacheName,
        exam_paper_id: examPaperId,
        question_number: questionNumber,
        cache_type: 'question_context',
        gemini_cache_name: geminiCacheName,
        model: model,
        system_prompt: systemPrompt,
        image_count: imageCount,
        marking_scheme_included: false,
        expires_at: expiresAt.toISOString()
      });

    if (error) throw error;

    console.log(`💾 Saved cache metadata: ${cacheName} -> ${geminiCacheName}`);
  } catch (error) {
    console.error('Error saving cache metadata:', error);
  }
}

// Generate content using Gemini cache
async function generateWithGeminiCache(
  geminiApiKey: string,
  geminiCacheName: string,
  userMessage: string,
  model: string = 'gemini-2.0-flash'
): Promise<any> {
  console.log(`🚀 Generating with cached content: ${geminiCacheName}`);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cachedContent: geminiCacheName,
        contents: [{
          role: "user",
          parts: [{ text: userMessage }]
        }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini cached generation error:", errorText);
    throw new Error(`Gemini API failed: ${response.status}`);
  }

  return await response.json();
}

// Generate content without cache (for content too small to cache)
async function generateWithoutCache(
  geminiApiKey: string,
  systemPrompt: string,
  questionPrompt: string,
  userMessage: string,
  imageData: string[],
  model: string = 'gemini-2.0-flash'
): Promise<any> {
  console.log(`🚀 Generating without cache (content below 4096 token threshold)`);

  const messageParts: any[] = [
    { text: systemPrompt },
    { text: questionPrompt },
    { text: userMessage }
  ];

  const imageParts = imageData.map((img) => ({
    inline_data: { mime_type: "image/jpeg", data: img }
  }));
  messageParts.push(...imageParts);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: messageParts
        }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", errorText);
    throw new Error(`Gemini API failed: ${response.status}`);
  }

  return await response.json();
}

// Increment cache use count
async function incrementCacheUseCount(supabaseClient: any, cacheId: string) {
  try {
    const { error } = await supabaseClient
      .rpc('increment_cache_use_count', { p_cache_id: cacheId });

    if (error) throw error;
  } catch (error) {
    console.error('Error incrementing cache use count:', error);
  }
}

// ========== EXISTING HELPERS ==========

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

async function loadConversationHistory(
  supabaseClient: any,
  conversationId: string | null,
  examPaperId: string,
  userId: string,
  questionNumber: string | null
): Promise<{ role: string; parts: any[] }[]> {
  if (!conversationId || !questionNumber) {
    return [];
  }

  try {
    // Get the last 4 messages (most recent) for this question
    const { data, error } = await supabaseClient
      .from('conversation_messages')
      .select('role, content, question_number, has_images, created_at')
      .eq('conversation_id', conversationId)
      .eq('question_number', questionNumber)
      .order('created_at', { ascending: false }) // Get newest first
      .limit(8); // Get last 8 messages (4 exchanges: user + AI response)

    if (error) throw error;

    // Reverse to get chronological order (oldest to newest)
    const sortedData = data.reverse();

    const history = sortedData.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    console.log(`Loaded ${history.length} messages (last ${Math.min(8, data.length)} from database) for Question ${questionNumber}`);

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

**CRITICAL: MATHEMATICAL NOTATION FORMATTING:**
- **ALWAYS** format mathematical expressions using LaTeX syntax for proper rendering
- For inline math (within text), wrap in single dollar signs: $x^2 + 5x + 6$
- For display math (standalone equations), wrap in double dollar signs: $$y = \frac{15}{x^3} - \frac{5}{x^2}$$
- Use proper LaTeX commands:
  - Fractions: $\frac{numerator}{denominator}$ not "numerator/denominator"
  - Exponents: $x^{2}$ or $x^{power}$ not "x^2" in plain text
  - Square roots: $\sqrt{x}$ not "sqrt(x)"
  - Subscripts: $x_{1}$ not "x_1" in plain text
  - Greek letters: $\alpha$, $\beta$, $\theta$, $\pi$, etc.
  - Trigonometric functions: $\sin(x)$, $\cos(x)$, $\tan(x)$
  - Logarithms: $\log(x)$, $\ln(x)$
- Examples of correct formatting:
  - CORRECT: "The equation is $$y = \frac{15}{x^3} - \frac{5}{x^2}$$"
  - WRONG: "The equation is y = 15/x^3 - 5/x^2"
  - CORRECT: "When $x = 2$, we get $y = \frac{15}{8} - \frac{5}{4} = \frac{5}{8}$"
  - WRONG: "When x = 2, we get y = 15/8 - 5/4 = 5/8"

**INTERPRETING QUESTION REFERENCES:**
If the student says "Question 2b" or "Q2b", treat it as "Question 2, part (b)" — that means find question 2 and focus on sub-part (b). The same applies for 2(a), 3c, etc.

**TASK:**
You have access to both the exam paper and its marking scheme, but the marking scheme is **strictly for internal reference only**. You must NOT mention, quote, or reveal the marking scheme in any part of your answer. Treat the marking scheme as invisible to the student.

Your task is to answer the student's question with a structured response. CRITICAL: You MUST structure your response EXACTLY in this format with these four sections:

## Solution
Provide a complete, step-by-step solution:
- Show all working clearly using proper LaTeX formatting for all math
- Explain each step of your reasoning
- Use proper mathematical/scientific notation with LaTeX
- Present the final answer clearly in LaTeX format
- Do NOT mention the marking scheme anywhere

## Explanation
Provide a clear, conceptual explanation suitable for an O-Level student. Break down complex ideas into simple, understandable terms. Focus on the fundamental concepts. Use LaTeX for any mathematical expressions. Do NOT copy from the marking scheme.

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
You already have the exam paper images in context from the previous message.

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
  
  // Add marking scheme text if available
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
    console.log(`Has marking scheme text: ${!!markingSchemeText}`);
    
    const isFollowUp = extractedQuestionNumber && lastQuestionNumber && 
                       extractedQuestionNumber === lastQuestionNumber;
    
    console.log(`Is follow-up question: ${isFollowUp}`);

    // Initialize Supabase client for fetching exam paper details and validation
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check subscription access before proceeding
    if (userId) {
      const { data: accessCheck, error: accessError } = await supabase
        .rpc('check_user_subscription_access', {
          p_user_id: userId,
          p_feature: 'chat'
        });

      if (accessError) {
        console.error('Error checking subscription access:', accessError);
      } else if (accessCheck && accessCheck.length > 0) {
        const access = accessCheck[0];

        if (!access.has_access) {
          let errorMessage = 'Access denied';
          let upgradeRequired = false;

          if (access.reason === 'Token limit exceeded') {
            errorMessage = `You've reached your monthly token limit. Please upgrade your subscription to continue using the AI assistant.`;
            upgradeRequired = true;
          } else if (access.reason === 'No active subscription') {
            errorMessage = `You don't have an active subscription. Please subscribe to use the AI assistant.`;
            upgradeRequired = true;
          }

          return new Response(
            JSON.stringify({
              error: errorMessage,
              accessDenied: true,
              upgradeRequired: upgradeRequired,
              tierName: access.tier_name,
              tokensRemaining: access.tokens_remaining,
              papersRemaining: access.papers_remaining
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`✅ Access granted - Tier: ${access.tier_name}`);
        console.log(`📊 Tokens remaining: ${access.tokens_remaining === -1 ? 'Unlimited' : access.tokens_remaining}`);
      }
    }

    // Build context-aware system prompt
    let contextualSystemPrompt = SYSTEM_PROMPT;

    // Fetch exam paper details including subject, grade, and AI prompt from subject level
    let subjectId: string | null = null;
    try {
      const { data: examPaper, error: examPaperError } = await supabase
        .from('exam_papers')
        .select(`
          title,
          subject_id,
          subjects (
            name,
            ai_prompts (system_prompt)
          ),
          grade_levels (name)
        `)
        .eq('id', examPaperId)
        .single();

      // Capture subject_id for AI model selection
      if (examPaper) {
        subjectId = examPaper.subject_id;
      }

      if (examPaperError) {
        console.error('Error fetching exam paper:', examPaperError);
        console.log('Falling back to default prompt');
      } else if (examPaper) {
        const subject = examPaper.subjects?.name || 'Unknown';
        const grade = examPaper.grade_levels?.name || 'Unknown';
        const examTitle = examPaper.title || 'Unknown';

        // Use custom AI prompt from subject if available, otherwise use default
        if (examPaper.subjects?.ai_prompts?.system_prompt) {
          contextualSystemPrompt = examPaper.subjects.ai_prompts.system_prompt
            .replace(/\{\{SUBJECT\}\}/g, subject)
            .replace(/\{\{GRADE\}\}/g, grade)
            .replace(/\{\{EXAM_TITLE\}\}/g, examTitle);

          console.log('Using custom AI prompt from subject with context');
        } else {
          // Add context to default prompt
          contextualSystemPrompt = `${SYSTEM_PROMPT}\n\n**EXAM CONTEXT:**\nThis is a ${grade} ${subject} exam paper: "${examTitle}". Tailor your explanations to this subject and level.`;
          console.log('Using default prompt with added context');
        }
      }
    } catch (fetchError) {
      console.error('Failed to fetch exam paper details:', fetchError);
      console.log('Using default prompt without context');
    }

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

    let finalExamImages = [];
    let usedOptimizedMode = false;
    let detectedQuestionNumber = extractedQuestionNumber;

    if (isFollowUp) {
      console.log(`Follow-up question detected - will check if cache exists`);
      // Don't set finalExamImages to empty yet - we'll decide after checking cache
      if (examPaperImages && examPaperImages.length > 0) {
        finalExamImages = examPaperImages;
        console.log(`Received ${examPaperImages.length} image(s) for follow-up (will use only if no cache)`);
      }
      usedOptimizedMode = true;
    } else if (optimizedMode && examPaperImages && examPaperImages.length > 0) {
      console.log(`Using OPTIMIZED mode for question ${detectedQuestionNumber}`);
      console.log(`Received ${examPaperImages.length} pre-fetched image(s)`);
      console.log(`Using marking scheme TEXT instead of images`);
      finalExamImages = examPaperImages;
      usedOptimizedMode = true;
    } else {
      console.log('No images provided - frontend should handle this with clarification');
      return new Response(
        JSON.stringify({
          error: "Question number not detected. Frontend should prompt user for clarification."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending to AI: ${finalExamImages.length} exam images + marking scheme TEXT (no images)`);

    // ========== GET AI MODEL (SUBJECT → USER → DEFAULT) ==========

    console.log("🤖 Selecting AI model...");
    let aiModel: AIModelConfig | null = null;
    let modelSource = "default";

    // 1. Try subject-specific AI model first
    if (subjectId) {
      console.log("🔍 Checking for subject-specific AI model...");
      aiModel = await getSubjectAIModel(supabase, subjectId);
      if (aiModel) {
        modelSource = "subject";
        console.log(`📚 Using subject-specific AI model: ${aiModel.display_name}`);
      }
    }

    // 2. Fall back to user's preferred AI model
    if (!aiModel && userId) {
      console.log("👤 Checking user's preferred AI model...");
      aiModel = await getUserAIModel(supabase, userId);
      if (aiModel) {
        modelSource = "user";
        console.log(`👤 Using user's preferred AI model: ${aiModel.display_name}`);
      }
    }

    // 3. Fall back to system default
    if (!aiModel) {
      console.log("📋 Using system default AI model");
      aiModel = await getDefaultAIModel(supabase);
      modelSource = "default";
    }

    console.log(`✅ AI Model Selected (${modelSource}): ${aiModel.display_name} (${aiModel.provider})`);
    console.log(`   - Model: ${aiModel.model_name}`);
    console.log(`   - Supports Vision: ${aiModel.supports_vision}`);
    console.log(`   - Supports Caching: ${aiModel.supports_caching}`);

    // ========== DUAL CACHE MODE LOGIC ==========

    // Get cache mode and API keys from settings
    const { useGeminiCache, cacheApiKey, legacyApiKey } = await getCacheModeAndKeys(supabase);

    // Validate API keys
    if (useGeminiCache && !cacheApiKey) {
      throw new Error("Gemini cache mode enabled but GEMINI_CACHE_API_KEY environment variable not configured");
    }
    if (!legacyApiKey) {
      throw new Error("GEMINI_ASSISTANT_API_KEY or GEMINI_API_KEY not configured");
    }

    let data: any;
    let usedCacheName: string | null = null;
    let cacheCreated = false;
    let modelUsed = aiModel.model_name;
    let promptTokenCount = 0;
    let candidatesTokenCount = 0;
    let totalTokenCount = 0;

    // ========== PROVIDER-SPECIFIC LOGIC ==========

    if (aiModel.provider !== 'gemini') {
      // ========== NON-GEMINI PROVIDERS (Claude, OpenAI) ==========
      console.log(`🌐 Using ${aiModel.provider.toUpperCase()} provider (no Gemini-specific caching)`);

      const questionPromptText = buildQuestionFocusPrompt(
        normalizedQuestion,
        detectedQuestionNumber,
        questionText,
        markingSchemeText,
        false
      );

      // For non-Gemini providers, we use simple message-based approach
      const aiResponse = await generateAIResponse({
        model: aiModel,
        messages: [{
          role: 'user',
          content: questionPromptText
        }],
        systemPrompt: contextualSystemPrompt,
        images: finalExamImages,
        temperature: 0.7
      });

      // Convert to Gemini-compatible format for downstream processing
      data = {
        candidates: [{
          content: {
            parts: [{ text: aiResponse.content }]
          }
        }],
        usageMetadata: {
          promptTokenCount: aiResponse.promptTokens,
          candidatesTokenCount: aiResponse.completionTokens,
          totalTokenCount: aiResponse.totalTokens
        }
      };

      promptTokenCount = aiResponse.promptTokens;
      candidatesTokenCount = aiResponse.completionTokens;
      totalTokenCount = aiResponse.totalTokens;

      console.log(`✅ ${aiModel.provider.toUpperCase()} response received`);
      console.log(`📊 Tokens: ${promptTokenCount} input + ${candidatesTokenCount} output = ${totalTokenCount} total`);

    } else if (useGeminiCache && detectedQuestionNumber) {
      // ========== GEMINI BUILT-IN CACHE MODE ==========
      console.log('🔥 Using GEMINI CACHE MODE');

      const questionPromptText = buildQuestionFocusPrompt(
        normalizedQuestion,
        detectedQuestionNumber,
        questionText,
        markingSchemeText,
        false
      );

      if (isFollowUp) {
        // Try to use existing cache
        console.log(`♻️ Follow-up question - looking for existing cache...`);
        const existingCache = await getGeminiCache(supabase, examPaperId, detectedQuestionNumber);

        if (existingCache) {
          // Use existing cache
          console.log(`✅ Using existing cache for Question ${detectedQuestionNumber}`);
          data = await generateWithGeminiCache(
            cacheApiKey!,
            existingCache.geminiCacheName,
            normalizedQuestion,
            'gemini-2.0-flash'
          );
          usedCacheName = existingCache.geminiCacheName;
          await incrementCacheUseCount(supabase, existingCache.cacheId);
          console.log(`💰 SAVED: Reusing cache (${existingCache.useCount + 1} times used)`);
        } else {
          // Cache expired or not found, create new one
          console.log(`⚠️ No cache found for follow-up question`);

          if (finalExamImages.length === 0) {
            console.log(`❌ ERROR: No images available and no cache - cannot provide context`);
            throw new Error('No cache found and no images provided for follow-up question. Please retry.');
          }

          console.log(`📸 Creating new cache with ${finalExamImages.length} images to maintain context...`);
          const cacheName = await createGeminiCache(
            cacheApiKey!,
            contextualSystemPrompt,
            questionPromptText,
            finalExamImages,
            'gemini-2.0-flash'
          );

          if (cacheName) {
            // Cache created successfully
            usedCacheName = cacheName;
            cacheCreated = true;

            await saveGeminiCacheMetadata(
              supabase,
              examPaperId,
              detectedQuestionNumber,
              cacheName,
              contextualSystemPrompt,
              finalExamImages.length,
              'gemini-2.0-flash'
            );

            data = await generateWithGeminiCache(
              cacheApiKey!,
              cacheName,
              normalizedQuestion,
              'gemini-2.0-flash'
            );
          } else {
            // Content too small for caching, use regular API
            console.log(`📝 Using non-cached generation for follow-up (content below threshold)`);
            data = await generateWithoutCache(
              cacheApiKey!,
              contextualSystemPrompt,
              questionPromptText,
              normalizedQuestion,
              finalExamImages,
              'gemini-2.0-flash'
            );
          }
        }
      } else {
        // First question - create cache
        console.log(`🆕 First question - creating new Gemini cache...`);
        const cacheName = await createGeminiCache(
          cacheApiKey!,
          contextualSystemPrompt,
          questionPromptText,
          finalExamImages,
          'gemini-2.0-flash'
        );

        if (cacheName) {
          // Cache created successfully
          usedCacheName = cacheName;
          cacheCreated = true;

          await saveGeminiCacheMetadata(
            supabase,
            examPaperId,
            detectedQuestionNumber,
            cacheName,
            contextualSystemPrompt,
            finalExamImages.length,
            'gemini-2.0-flash'
          );

          data = await generateWithGeminiCache(
            cacheApiKey!,
            cacheName,
            normalizedQuestion,
            'gemini-2.0-flash'
          );

          console.log(`💾 Cache created and saved for future use`);
        } else {
          // Content too small for caching, use regular API
          console.log(`📝 Using non-cached generation (content below 4096 token threshold)`);
          data = await generateWithoutCache(
            cacheApiKey!,
            contextualSystemPrompt,
            questionPromptText,
            normalizedQuestion,
            finalExamImages,
            'gemini-2.0-flash'
          );
        }
      }

    } else {
      // ========== OWN DATABASE CACHE MODE (EXISTING LOGIC) ==========
      console.log('🗄️ Using OWN CACHE MODE (database history)');

      let conversationHistory = [];

      if (isFollowUp) {
        conversationHistory = await loadConversationHistory(
          supabase,
          conversationId,
          examPaperId,
          userId,
          detectedQuestionNumber
        );
        console.log(`📚 FOLLOW-UP: Loaded ${conversationHistory.length} previous messages for Question ${detectedQuestionNumber}`);

        // Check if we have sufficient cache
        if (conversationHistory.length < 2) {
          console.log(`⚠️ INSUFFICIENT CACHE: Only ${conversationHistory.length} messages found - treating as new question`);
          console.log(`📸 Sending question images + marking scheme to provide context`);
        } else {
          console.log(`💰 COST OPTIMIZATION: Reusing ${conversationHistory.length} cached messages instead of re-sending images`);
        }
      } else {
        console.log(`🆕 NEW QUESTION: Starting fresh context for Question ${detectedQuestionNumber}`);
        console.log(`💰 COST OPTIMIZATION: No history loaded (fresh question = no unnecessary context)`);
      }

      const contents = [];
      contents.push(...conversationHistory);

      const currentMessageParts: any[] = [
        { text: contextualSystemPrompt },
        { text: buildQuestionFocusPrompt(
          normalizedQuestion,
          detectedQuestionNumber,
          questionText,
          markingSchemeText,
          isFollowUp && conversationHistory.length >= 2 // Only treat as follow-up if we have cache
        )}
      ];

      // Send images if:
      // 1. It's a new question (!isFollowUp), OR
      // 2. It's a follow-up but no sufficient cache exists (< 2 messages)
      const shouldSendImages = !isFollowUp || conversationHistory.length < 2;

      if (shouldSendImages) {
        if (conversationHistory.length < 2 && conversationHistory.length > 0) {
          console.log(`🔄 Follow-up with insufficient cache - sending images to maintain context`);
        }
        const imageParts = finalExamImages.map((img) => ({
          inline_data: { mime_type: "image/jpeg", data: img }
        }));
        currentMessageParts.push(...imageParts);
      }

      contents.push({
        role: "user",
        parts: currentMessageParts
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${legacyApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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

      data = await response.json();
    }
    const aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated";

    // Extract token usage if not already extracted (for Gemini paths)
    if (promptTokenCount === 0) {
      const usageMetadata = data?.usageMetadata || {};
      promptTokenCount = usageMetadata.promptTokenCount || 0;
      candidatesTokenCount = usageMetadata.candidatesTokenCount || 0;
      totalTokenCount = usageMetadata.totalTokenCount || (promptTokenCount + candidatesTokenCount);
    }

    // Log token usage for monitoring
    console.log('=== Token Usage ===');
    console.log(`Provider: ${aiModel.provider}`);
    console.log(`Model used: ${modelUsed}`);
    console.log(`Input tokens: ${promptTokenCount}`);
    console.log(`Output tokens: ${candidatesTokenCount}`);
    console.log(`Total tokens: ${totalTokenCount}`);
    if (aiModel.provider === 'gemini') {
      console.log(`Cache mode: ${useGeminiCache ? 'Gemini built-in cache' : 'Own database cache'}`);
      if (useGeminiCache) {
        console.log(`Cache used: ${usedCacheName || 'none'}`);
        console.log(`Cache created: ${cacheCreated}`);
      }
    }
    console.log(`Images sent: ${finalExamImages.length}`);

    // Get model pricing from database for accurate cost calculation
    const { data: modelData, error: modelError } = await supabase
      .from('ai_models')
      .select('input_token_cost_per_million, output_token_cost_per_million')
      .eq('model_name', aiModel.model_name)
      .single();

    let inputCost = 0;
    let outputCost = 0;
    let totalCost = 0;

    if (!modelError && modelData) {
      inputCost = (promptTokenCount / 1000000) * modelData.input_token_cost_per_million;
      outputCost = (candidatesTokenCount / 1000000) * modelData.output_token_cost_per_million;
      totalCost = inputCost + outputCost;
    }

    console.log(`Estimated cost: $${totalCost.toFixed(6)}`);

    // Save token usage to database for cost tracking and analytics

    // Get model ID for logging
    const { data: aiModelData } = await supabase
      .from('ai_models')
      .select('id')
      .eq('model_name', aiModel.model_name)
      .single();

    try {
      await supabase.from('token_usage_logs').insert({
        user_id: userId || null,
        exam_paper_id: examPaperId,
        conversation_id: conversationId || null,
        question_number: detectedQuestionNumber,
        model: modelUsed,
        provider: aiModel.provider,
        ai_model_id: aiModelData?.id || null,
        prompt_tokens: promptTokenCount,
        completion_tokens: candidatesTokenCount,
        total_tokens: totalTokenCount,
        estimated_cost: totalCost,
        images_count: finalExamImages.length,
        is_follow_up: isFollowUp
      });
      console.log('Token usage logged to database');

      // Update user subscription token usage with cost-based adjustment
      if (userId) {
        // Calculate cost-adjusted token consumption using the database function
        // This ensures that more expensive models consume proportionally more from the user's allocation
        const { data: adjustedTokenData, error: calcError } = await supabase
          .rpc('calculate_cost_based_token_consumption', {
            p_actual_prompt_tokens: promptTokenCount,
            p_actual_completion_tokens: candidatesTokenCount,
            p_actual_cost: totalCost
          });

        let tokensToDeduct = totalTokenCount; // Default to actual tokens if calculation fails

        if (!calcError && adjustedTokenData) {
          tokensToDeduct = adjustedTokenData;
          console.log(`Cost-based token adjustment: ${totalTokenCount} actual tokens -> ${tokensToDeduct} Gemini-equivalent tokens (${(tokensToDeduct / totalTokenCount).toFixed(2)}x multiplier)`);
        } else {
          console.error('Failed to calculate cost-based tokens, using actual token count:', calcError);
        }

        // First get current usage
        const { data: currentSub, error: fetchError } = await supabase
          .from('user_subscriptions')
          .select('tokens_used_current_period')
          .eq('user_id', userId)
          .eq('status', 'active')
          .single();

        if (fetchError) {
          console.error('Failed to fetch current subscription:', fetchError);
        } else if (currentSub) {
          const newTokenCount = currentSub.tokens_used_current_period + tokensToDeduct;

          const { error: updateError } = await supabase
            .from('user_subscriptions')
            .update({
              tokens_used_current_period: newTokenCount
            })
            .eq('user_id', userId)
            .eq('status', 'active');

          if (updateError) {
            console.error('Failed to update subscription token usage:', updateError);
          } else {
            console.log(`Updated subscription token usage: ${currentSub.tokens_used_current_period} -> ${newTokenCount} (+${tokensToDeduct} Gemini-equivalent tokens, ${totalTokenCount} actual tokens, cost $${totalCost.toFixed(6)})`);
          }
        }
      }
    } catch (logError) {
      console.error('Failed to log token usage:', logError);
      // Don't fail the request if logging fails
    }

    return new Response(
      JSON.stringify({
        answer: aiResponse,
        model: modelUsed,
        provider: aiModel.provider,
        optimized: usedOptimizedMode,
        questionNumber: detectedQuestionNumber,
        imagesUsed: finalExamImages.length,
        isFollowUp: isFollowUp,
        usedMarkingSchemeText: !!markingSchemeText,
        cacheMode: aiModel.provider === 'gemini' ? (useGeminiCache ? 'gemini' : 'own') : 'none',
        cacheInfo: (aiModel.provider === 'gemini' && useGeminiCache) ? {
          cacheName: usedCacheName,
          cacheCreated: cacheCreated,
          cacheReused: !cacheCreated && !!usedCacheName
        } : null,
        tokenUsage: {
          promptTokens: promptTokenCount,
          completionTokens: candidatesTokenCount,
          totalTokens: totalTokenCount,
          estimatedCost: totalCost
        }
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
