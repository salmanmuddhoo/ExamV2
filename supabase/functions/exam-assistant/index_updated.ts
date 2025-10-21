import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};

// ... [Keep all existing helper functions: extractQuestionNumber, normalizeQuestionReference,
//      validateQuestionExists, generateQuestionNotFoundResponse, loadConversationHistory,
//      saveMessage, SYSTEM_PROMPT, buildQuestionFocusPrompt]

// NEW: Helper to get cache mode from settings
async function getCacheMode(supabaseClient: any): Promise<boolean> {
  try {
    const { data, error } = await supabaseClient
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'ai_cache_mode')
      .single();

    if (error || !data) {
      console.log('Cache mode setting not found, defaulting to own cache (false)');
      return false;
    }

    const useGeminiCache = data.setting_value?.useGeminiCache ?? false;
    console.log(`Cache mode: ${useGeminiCache ? 'Gemini built-in cache' : 'Own database cache'}`);
    return useGeminiCache;
  } catch (error) {
    console.error('Error fetching cache mode:', error);
    return false; // Default to own cache on error
  }
}

// NEW: Get existing Gemini cache for a question
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
      console.log(`Found existing Gemini cache: ${data[0].gemini_cache_name}`);
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

// NEW: Create Gemini cache
async function createGeminiCache(
  geminiApiKey: string,
  systemPrompt: string,
  questionPrompt: string,
  imageData: string[],
  model: string = 'gemini-2.0-flash-exp'
): Promise<string> {
  const cacheParts: any[] = [
    { text: systemPrompt },
    { text: questionPrompt }
  ];

  // Add images
  const imageParts = imageData.map((img) => ({
    inline_data: { mime_type: "image/jpeg", data: img }
  }));
  cacheParts.push(...imageParts);

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
        ttl: "3600s" // Cache for 1 hour
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini cache creation error:", errorText);
    throw new Error(`Failed to create Gemini cache: ${response.status}`);
  }

  const data = await response.json();
  const cacheName = data.name; // Format: "cachedContents/xyz123"

  console.log(`✅ Created Gemini cache: ${cacheName}`);
  return cacheName;
}

// NEW: Save Gemini cache metadata to database
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
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour from now

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

    console.log(`Saved cache metadata: ${cacheName} -> ${geminiCacheName}`);
  } catch (error) {
    console.error('Error saving cache metadata:', error);
    // Don't fail the request if metadata saving fails
  }
}

// NEW: Generate content using Gemini cache
async function generateWithGeminiCache(
  geminiApiKey: string,
  geminiCacheName: string,
  userMessage: string,
  model: string = 'gemini-2.0-flash-exp'
): Promise<any> {
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

// ... [Rest of the Deno.serve handler - I'll continue this in the next message due to length]
