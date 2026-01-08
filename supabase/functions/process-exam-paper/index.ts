import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProcessRequest {
  examPaperId: string;
  pageImages: Array<{ pageNumber: number; base64Image: string }>;
  markingSchemeImages?: Array<{ pageNumber: number; base64Image: string }>;
}

// Helper function to fetch AI model pricing from database
async function getModelPricing(supabase: any, modelName: string): Promise<{ inputCost: number; outputCost: number }> {
  try {
    const { data, error } = await supabase
      .from('ai_models')
      .select('input_token_cost_per_million, output_token_cost_per_million')
      .eq('model_name', modelName)
      .single();

    if (error) {
      console.error('Error fetching model pricing:', error);
      // Fallback to Gemini 2.0 Flash default pricing
      return { inputCost: 0.075, outputCost: 0.30 };
    }

    return {
      inputCost: data.input_token_cost_per_million,
      outputCost: data.output_token_cost_per_million
    };
  } catch (err) {
    console.error('Error in getModelPricing:', err);
    // Fallback to Gemini 2.0 Flash default pricing
    return { inputCost: 0.075, outputCost: 0.30 };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { examPaperId, pageImages, markingSchemeImages }: ProcessRequest = await req.json();

    if (!examPaperId || !pageImages || pageImages.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_UPLOAD_API_KEY') || Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error("GEMINI_UPLOAD_API_KEY or GEMINI_API_KEY not configured");
    }

    console.log(`Analyzing ${pageImages.length} pages with Gemini...`);

    const { questions, tokenUsage: extractTokens } = await extractAndSplitQuestions(pageImages, geminiApiKey, supabase);

    console.log(`Extracted ${questions.length} questions`);

    if (questions.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "No questions detected", 
          details: "Gemini could not identify any questions in the exam paper"
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const savedQuestions = await saveQuestionImages(
      questions,
      pageImages,
      supabase,
      examPaperId
    );

    // Extract marking scheme answers if marking scheme is provided
    let markingSchemeData: Map<string, string> = new Map();
    let markingSchemeTokens = null;
    if (markingSchemeImages && markingSchemeImages.length > 0) {
      console.log(`Extracting marking scheme for ${questions.length} questions...`);
      const markingResult = await extractMarkingScheme(
        questions,
        markingSchemeImages,
        geminiApiKey,
        supabase
      );
      markingSchemeData = markingResult.markingScheme;
      markingSchemeTokens = markingResult.tokenUsage;
      console.log(`Extracted marking scheme for ${markingSchemeData.size} questions`);
    }

    console.log(`Saving ${savedQuestions.length} questions to database...`);
    
    let savedCount = 0;
    let errorCount = 0;
    
    for (const q of savedQuestions) {
      const pageNumbersArray = Array.isArray(q.pageNumbers) ? q.pageNumbers : [q.pageNumbers];
      const imageUrlsArray = Array.isArray(q.imageUrls) ? q.imageUrls : [q.imageUrl];
      
      // Get marking scheme text for this question
      const markingSchemeText = markingSchemeData.get(q.questionNumber) || null;
      
      const insertData = {
        exam_paper_id: examPaperId,
        question_number: String(q.questionNumber),
        page_numbers: pageNumbersArray,
        ocr_text: q.fullText || '',
        image_url: q.imageUrl || '',
        image_urls: imageUrlsArray,
        marking_scheme_text: markingSchemeText,
      };
      
      const { error } = await supabase.from('exam_questions').insert(insertData);
      
      if (error) {
        console.error(`Failed to save question ${q.questionNumber}:`, error);
        errorCount++;
      } else {
        console.log(`Saved question ${q.questionNumber} to database`);
        savedCount++;
      }
    }
    
    console.log(`Database save complete: ${savedCount} saved, ${errorCount} errors`);

    // NOW tag questions with chapters (after they're saved to database)
    let chapterTaggingTokens = null;
    let taggedQuestionsCount = 0;

    // Get exam paper details to find matching syllabus
    const { data: examPaper } = await supabase
      .from('exam_papers')
      .select('subject_id, grade_level_id')
      .eq('id', examPaperId)
      .single();

    // Check if there's a syllabus for this subject and grade
    if (examPaper) {
      const { data: syllabus } = await supabase
        .from('syllabus')
        .select('id, file_url, syllabus_chapters(id, chapter_number, chapter_title, chapter_description, subtopics)')
        .eq('subject_id', examPaper.subject_id)
        .eq('grade_id', examPaper.grade_level_id)
        .eq('processing_status', 'completed')
        .single();

      if (syllabus && syllabus.file_url && syllabus.syllabus_chapters && syllabus.syllabus_chapters.length > 0) {
        console.log(`Found syllabus with ${syllabus.syllabus_chapters.length} chapters. Starting chapter tagging...`);

        // Tag questions with chapters using AI
        const taggingResult = await tagQuestionsWithChapters(
          examPaperId,
          questions,
          syllabus.syllabus_chapters,
          syllabus.id,
          syllabus.file_url,
          supabase,
          geminiApiKey
        );

        chapterTaggingTokens = taggingResult.tokenUsage;
        taggedQuestionsCount = taggingResult.taggedCount;

        console.log(`Successfully tagged ${taggedQuestionsCount} questions with chapters`);
      } else {
        console.log('No completed syllabus found for this subject/grade. Skipping chapter tagging.');
      }
    }

    // Calculate total token usage and cost
    const totalPromptTokens = extractTokens.promptTokens + (markingSchemeTokens?.promptTokens || 0) + (chapterTaggingTokens?.promptTokens || 0);
    const totalCompletionTokens = extractTokens.completionTokens + (markingSchemeTokens?.completionTokens || 0) + (chapterTaggingTokens?.completionTokens || 0);
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const totalCost = extractTokens.cost + (markingSchemeTokens?.cost || 0) + (chapterTaggingTokens?.cost || 0);

    console.log('=== Processing Token Usage ===');
    console.log(`Question extraction: ${extractTokens.totalTokens} tokens, $${extractTokens.cost.toFixed(6)}`);
    if (markingSchemeTokens) {
      console.log(`Marking scheme extraction: ${markingSchemeTokens.totalTokens} tokens, $${markingSchemeTokens.cost.toFixed(6)}`);
    }
    if (chapterTaggingTokens) {
      console.log(`Chapter tagging: ${chapterTaggingTokens.totalTokens} tokens, $${chapterTaggingTokens.cost.toFixed(6)}`);
    }
    console.log(`Total: ${totalTokens} tokens, $${totalCost.toFixed(6)}`);

    // Save token usage to database
    try {
      await supabase.from('token_usage_logs').insert({
        exam_paper_id: examPaperId,
        model: 'gemini-2.0-flash-exp',
        provider: 'gemini',
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalTokens,
        estimated_cost: totalCost,
        images_count: pageImages.length + (markingSchemeImages?.length || 0),
        is_follow_up: false
      });
      console.log('✅ Token usage saved to database');
    } catch (logError) {
      console.error('Failed to log token usage:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        questionsCount: savedQuestions.length,
        taggedQuestionsCount,
        questions: savedQuestions.map(q => ({
          number: q.questionNumber,
          pages: q.pageNumbers,
          imageCount: q.imageUrls.length,
          preview: q.fullText.substring(0, 100) + '...'
        })),
        tokenUsage: {
          totalTokens,
          totalCost: parseFloat(totalCost.toFixed(6)),
          breakdown: {
            extraction: {
              tokens: extractTokens.totalTokens,
              cost: parseFloat(extractTokens.cost.toFixed(6))
            },
            markingScheme: markingSchemeTokens ? {
              tokens: markingSchemeTokens.totalTokens,
              cost: parseFloat(markingSchemeTokens.cost.toFixed(6))
            } : null,
            chapterTagging: chapterTaggingTokens ? {
              tokens: chapterTaggingTokens.totalTokens,
              cost: parseFloat(chapterTaggingTokens.cost.toFixed(6))
            } : null
          }
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function extractAndSplitQuestions(
  pageImages: Array<{ pageNumber: number; base64Image: string }>,
  geminiApiKey: string,
  supabase: any
) {
  
  const imageParts = pageImages.map(page => ({
    inline_data: {
      mime_type: "image/jpeg",
      data: page.base64Image
    }
  }));

  const AI_PROMPT = `Extract and split all questions from this exam paper.

**CRITICAL INSTRUCTIONS:**
1. Return ONLY a JSON array - no other text
2. Keep "fullText" EXTREMELY SHORT - maximum 30 characters per question (just enough to identify it)
3. In "fullText", replace ALL newlines and line breaks with spaces
4. Format: [{"questionNumber":"1","startPage":1,"endPage":1,"fullText":"Work out (a) 6 - 2...","hasSubParts":false}]

**IMPORTANT FOR MULTI-PAGE QUESTIONS:**
- Look CAREFULLY at where each question ENDS
- A question continues to the NEXT page if you don't see a new question number
- If page 2 starts "Question 2" but page 3 doesn't start "Question 3", then Question 2 spans BOTH pages 2 AND 3
- Set startPage = first page of question, endPage = last page of question
- Questions often span 2-3 pages - DON'T assume each question is only 1 page

**What to look for:**
- "Question 1", "Q1", "1.", "1)" patterns mark the START of a question
- A new question number marks the END of the previous question
- If no new question number appears, the question continues

**Example:**
- Page 1: "Question 1: Calculate..."
- Page 2: "...continued from Q1, then answer part (c)" 
- Page 3: "Question 2: Explain..."
Result: Q1 spans pages 1-2, Q2 starts page 3

**Example output:**
[
  {"questionNumber":"1","startPage":1,"endPage":2,"fullText":"Calculate the derivative","hasSubParts":false},
  {"questionNumber":"2","startPage":3,"endPage":3,"fullText":"Explain the process","hasSubParts":true}
]

**REMEMBER:** fullText must be 30 characters or less. Truncate with "..." if needed.

Return ONLY the JSON array, nothing else.`;

  try {
    console.log("Sending to Gemini AI...");
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: AI_PROMPT },
              ...imageParts
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 65536, // Increased to handle exams with 50+ questions
            responseMimeType: "application/json",
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API failed with status ${response.status}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error("No text in response!");
      throw new Error("Empty response from Gemini");
    }

    // Extract token usage
    const usageMetadata = data?.usageMetadata || {};
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const completionTokens = usageMetadata.candidatesTokenCount || 0;
    const totalTokensUsed = usageMetadata.totalTokenCount || (promptTokens + completionTokens);

    // Fetch dynamic pricing from database
    const modelName = 'gemini-2.0-flash-exp';
    const pricing = await getModelPricing(supabase, modelName);

    // Calculate cost using database pricing
    const inputCost = (promptTokens / 1000000) * pricing.inputCost;
    const outputCost = (completionTokens / 1000000) * pricing.outputCost;
    const totalCost = inputCost + outputCost;
    
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      console.warn(`⚠️ Response may be incomplete. Finish reason: ${finishReason}`);
      if (finishReason === 'MAX_TOKENS') {
        console.error('❌ Response truncated due to MAX_TOKENS limit. Increase maxOutputTokens or simplify prompt.');
      }
    }

    let jsonText = rawText.trim();
    
    if (jsonText.includes('```')) {
      const match = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) {
        jsonText = match[1].trim();
      }
    }
    
    if (!jsonText.startsWith('[')) {
      const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonText = arrayMatch[0];
      }
    }

    jsonText = jsonText.trim();

    // Sanitize JSON to handle control characters that break JSON parsing
    // This is a fallback since responseMimeType: "application/json" should handle this
    console.log("Raw JSON length:", jsonText.length);

    // Check if there are unescaped control characters
    const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/.test(jsonText);
    if (hasControlChars) {
      console.warn("Found unescaped control characters in JSON, sanitizing...");
      // Replace control characters (except already-escaped ones)
      jsonText = jsonText.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');
    }

    let questions;
    try {
      questions = JSON.parse(jsonText);
      console.log(`Successfully parsed ${questions.length} questions`);
    } catch (parseError) {
      console.error("JSON parse error:", parseError.message);
      console.error("First 500 chars of problematic JSON:", jsonText.substring(0, 500));
      console.error("Last 500 chars of problematic JSON:", jsonText.substring(Math.max(0, jsonText.length - 500)));

      try {
        // Try to salvage partial response by finding the last complete object
        console.log("Attempting to salvage truncated JSON...");

        // Find the position of the last complete closing brace before the error
        let lastValidPosition = jsonText.length;
        let braceCount = 0;
        let inString = false;
        let escape = false;

        // Scan backwards to find valid JSON
        for (let i = jsonText.length - 1; i >= 0; i--) {
          const char = jsonText[i];

          if (escape) {
            escape = false;
            continue;
          }

          if (char === '\\') {
            escape = true;
            continue;
          }

          if (char === '"' && !escape) {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === '}') braceCount++;
            if (char === '{') braceCount--;

            // Found a complete array of objects
            if (char === ']' && braceCount === 0) {
              lastValidPosition = i + 1;
              break;
            }
          }
        }

        // Try to parse the truncated but valid portion
        const salvaged = jsonText.substring(0, lastValidPosition);

        // If it doesn't end with ], add it
        if (!salvaged.trim().endsWith(']')) {
          // Try to close the array properly
          const closedJson = salvaged.trim().replace(/,\s*$/, '') + ']';
          questions = JSON.parse(closedJson);
        } else {
          questions = JSON.parse(salvaged);
        }

        console.log(`✅ Salvaged ${questions.length} questions from truncated response`);
      } catch (salvageError) {
        console.error("Salvage also failed:", salvageError.message);
        throw new Error(`JSON parse failed. The response was truncated and could not be salvaged. Try uploading a shorter exam paper or contact support.`);
      }
    }

    if (!Array.isArray(questions)) {
      throw new Error("Gemini response is not an array");
    }

    const validQuestions = questions.filter(q => {
      const isValid = q.questionNumber && 
                     typeof q.startPage === 'number' && 
                     typeof q.endPage === 'number' &&
                     q.fullText;
      
      if (!isValid) {
        console.warn("Invalid question detected:", q);
      }
      return isValid;
    });

    console.log(`Validated ${validQuestions.length} questions`);

    return {
      questions: validQuestions,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens: totalTokensUsed,
        cost: totalCost
      }
    };

  } catch (error) {
    console.error("AI extraction failed:", error);
    throw new Error(`AI extraction failed: ${error.message}`);
  }
}

async function saveQuestionImages(
  questions: any[],
  pageImages: Array<{ pageNumber: number; base64Image: string }>,
  supabase: any,
  examPaperId: string
) {
  
  const results = [];

  for (const question of questions) {
    try {
      const relevantPages = pageImages.filter(
        p => p.pageNumber >= question.startPage && 
             p.pageNumber <= question.endPage
      );

      if (relevantPages.length === 0) {
        console.warn(`No pages found for question ${question.questionNumber}`);
        continue;
      }

      console.log(`Processing question ${question.questionNumber}: ${relevantPages.length} page(s)`);

      const imageUrls: string[] = [];
      
      for (let i = 0; i < relevantPages.length; i++) {
        const page = relevantPages[i];
        const cleanQuestionNum = question.questionNumber.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${examPaperId}/q${cleanQuestionNum}_page${i + 1}.jpg`;
        
        const imageBuffer = Uint8Array.from(atob(page.base64Image), c => c.charCodeAt(0));
        
        const { error: uploadError } = await supabase.storage
          .from('exam-questions')
          .upload(fileName, imageBuffer, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (uploadError) {
          console.error(`Upload error for Q${question.questionNumber} page ${i + 1}:`, uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('exam-questions')
          .getPublicUrl(fileName);
        
        imageUrls.push(urlData.publicUrl);
      }

      if (imageUrls.length === 0) {
        console.error(`No images uploaded for question ${question.questionNumber}`);
        continue;
      }

      results.push({
        questionNumber: question.questionNumber,
        pageNumbers: relevantPages.map(p => p.pageNumber),
        fullText: question.fullText,
        imageUrls: imageUrls,
        imageUrl: imageUrls[0],
      });

      console.log(`Uploaded ${imageUrls.length} image(s) for question ${question.questionNumber}`);

    } catch (error) {
      console.error(`Failed to save question ${question.questionNumber}:`, error);
    }
  }

  return results;
}

/**
 * Extract marking scheme answers for each question using Gemini AI
 */
async function extractMarkingScheme(
  questions: any[],
  markingSchemeImages: Array<{ pageNumber: number; base64Image: string }>,
  geminiApiKey: string,
  supabase: any
): Promise<{ markingScheme: Map<string, string>; tokenUsage: any }> {
  
  const imageParts = markingSchemeImages.map(page => ({
    inline_data: {
      mime_type: "image/jpeg",
      data: page.base64Image
    }
  }));

  // Build list of question numbers
  const questionNumbers = questions.map(q => q.questionNumber).join(', ');

  const MARKING_SCHEME_PROMPT = `You are analyzing a marking scheme document for an exam paper.

The exam has these questions: ${questionNumbers}

**Task:**
Extract the marking scheme for each question. The marking scheme may be in two formats:

FORMAT 1 (Specific answers): Question parts with exact answers and marks
Example: "2(a) Printer [1 mark]"

FORMAT 2 (Essay criteria): General marking guidance
Example: "Mark according to levels of response marking criteria"

**Your output must be valid JSON.**

Return a JSON object where:
- Keys are question numbers: "1", "2", "3" (use MAIN question number only, not sub-parts)
- Values are the complete marking scheme text for that question

**Rules:**
1. For FORMAT 1: List all sub-parts with their answers and marks
   Example: "Part (a): Printer - 1 mark. Part (b)(i): 0001 0100 1011 or 1001 0111 1010 - 2 marks. Part (b)(ii): Any two from - Easier for customer to understand or read or remember, Takes up less space on ticket or Shorter representation - 2 marks. Part (c)(i): 44 or 267 - 2 marks. Part (c)(ii): 6D or 19F - 2 marks."

2. For FORMAT 2: Include the general guidance
   Example: "EITHER Part (a): In what ways and with what effects does Webster portray different attitudes to marriage in the play The Duchess of Malfi - 25 marks. Mark according to levels of response marking criteria. OR Part (b): Comment closely on Webster's dramatic presentation of Bosola's attitude to Ferdinand in the following extract - 25 marks. Mark according to levels of response marking criteria."

3. Replace ALL newlines with spaces
4. Replace bullet points with "or" or commas
5. Use forward slashes (/) for alternative answers
6. Keep marks in format "X mark" or "X marks"
7. If no marking scheme found, use empty string ""

**Example output:**
{
  "1": "Part (a): Nibble - 1 mark. Part (b): 2048 TiB - 1 mark. Part (c)(i): Compression - 1 mark. Part (c)(ii): Reduced storage space required or Faster transmission time - 1 mark.",
  "2": "Part (a): Printer - 1 mark. Part (b)(i): 0001 0100 1011 or 1001 0111 1010 - 2 marks. Part (b)(ii): Any two from - Easier for customer to understand, Takes less space on ticket - 2 marks.",
  "3": "EITHER Part (a): Essay on Webster's portrayal - 25 marks. Mark according to levels of response. OR Part (b): Analysis of Bosola's attitude - 25 marks. Mark according to levels.",
  "4": "EITHER Part (a): Dramatic ways Williams explores relationships - 25 marks. Mark according to levels. OR Part (b): Williams presentation of Big Daddy - 25 marks. Mark according to levels."
}

Return ONLY the JSON object.`;

  try {
    console.log("Extracting marking scheme with Gemini...");
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: MARKING_SCHEME_PROMPT },
              ...imageParts
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 16384,
            responseMimeType: "application/json",
          }
        }),
      }
    );

    if (!response.ok) {
      console.error("Marking scheme extraction failed:", response.status);
      return {
        markingScheme: new Map(),
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
      };
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error("No marking scheme response");
      return {
        markingScheme: new Map(),
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
      };
    }

    // Extract token usage
    const usageMetadata = data?.usageMetadata || {};
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const completionTokens = usageMetadata.candidatesTokenCount || 0;
    const totalTokensUsed = usageMetadata.totalTokenCount || (promptTokens + completionTokens);

    // Fetch dynamic pricing from database
    const modelName = 'gemini-2.0-flash-exp';
    const pricing = await getModelPricing(supabase, modelName);

    // Calculate cost using database pricing
    const inputCost = (promptTokens / 1000000) * pricing.inputCost;
    const outputCost = (completionTokens / 1000000) * pricing.outputCost;
    const totalCost = inputCost + outputCost;

    let jsonText = rawText.trim();
    
    // Clean markdown if present
    if (jsonText.includes('```')) {
      const match = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) {
        jsonText = match[1].trim();
      }
    }

    const markingSchemeObj = JSON.parse(jsonText);
    const resultMap = new Map<string, string>();
    
    for (const [questionNum, text] of Object.entries(markingSchemeObj)) {
      if (text && typeof text === 'string') {
        resultMap.set(questionNum, text);
        console.log(`Extracted marking scheme for Q${questionNum}: ${text.substring(0, 80)}...`);
      }
    }

    return {
      markingScheme: resultMap,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens: totalTokensUsed,
        cost: totalCost
      }
    };

  } catch (error) {
    console.error("Failed to extract marking scheme:", error);
    return {
      markingScheme: new Map(),
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
    };
  }
}

/**
 * Tag questions with syllabus chapters using AI analysis
 * Uses the full syllabus PDF for more accurate matching
 */
async function tagQuestionsWithChapters(
  examPaperId: string,
  questions: any[],
  chapters: any[],
  syllabusId: string,
  fileUrl: string,
  supabase: any,
  geminiApiKey: string
): Promise<{ taggedCount: number; tokenUsage: any }> {

  // Build chapter information for AI (to provide chapter IDs)
  const chapterInfo = chapters.map(ch => ({
    id: ch.id,
    number: ch.chapter_number,
    title: ch.chapter_title
  }));

  // Build question information for AI (using the extracted questions data)
  const questionInfo = questions.map(q => ({
    number: q.questionNumber,
    text: q.fullText
  }));

  console.log('Chapter info being sent to AI:');
  chapterInfo.forEach(ch => {
    console.log(`  - ID: ${ch.id}, Chapter ${ch.number}: ${ch.title}`);
  });

  console.log('Fetching syllabus PDF from:', fileUrl);

  // Fetch and convert PDF to base64
  const pdfResponse = await fetch(fileUrl);
  if (!pdfResponse.ok) {
    throw new Error(`Failed to fetch syllabus PDF: ${pdfResponse.statusText}`);
  }
  const pdfBlob = await pdfResponse.blob();
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const base64Pdf = await arrayBufferToBase64(arrayBuffer);

  console.log(`Syllabus PDF fetched and converted to base64, size: ${pdfBlob.size} bytes`);

  const CHAPTER_TAGGING_PROMPT = `You are analyzing exam questions to match them with syllabus chapters from the provided PDF.

**REFERENCE CHAPTERS (YOU MUST USE THESE EXACT IDs):**
${chapterInfo.map(ch => `
┌─────────────────────────────────────────
│ Chapter Number: ${ch.number}
│ Chapter Title: ${ch.title}
│ UUID (USE THIS EXACT VALUE): ${ch.id}
└─────────────────────────────────────────`).join('\n')}

**QUESTIONS:**
${questionInfo.map(q => `Question ${q.number}: ${q.text}`).join('\n\n')}

**Task:**
Read the FULL SYLLABUS PDF provided and compare each question against the COMPLETE CONTENT of each chapter in the PDF.
For each question, identify which chapter(s) it belongs to by reading the detailed content, subtopics, and learning objectives in the PDF.

**CRITICAL INSTRUCTIONS:**
1. Read through the ENTIRE syllabus PDF to understand all chapter content
2. For each question, carefully compare it against the full chapter content in the PDF (not just the titles above)
3. Match questions to chapters based on the detailed content, subtopics, and concepts in the PDF
4. A question may relate to multiple chapters if it spans multiple topics

**⚠️ EXTREMELY IMPORTANT - chapterId FIELD:**
- The "chapterId" field MUST be the EXACT UUID string shown above (e.g., "5afd0da8-9afc-4b05-85c7-11542132639a")
- DO NOT use chapter numbers (1, 2, 3, etc.) as the chapterId
- DO NOT make up UUIDs
- COPY the UUID exactly from the reference list above
- Match the chapter number from the PDF to find the correct UUID in the reference list

**Example - CORRECT:**
"chapterId": "5afd0da8-9afc-4b05-85c7-11542132639a"  ✅ (Full UUID)

**Example - WRONG:**
"chapterId": "5"  ❌ (Chapter number, not UUID)
"chapterId": 5    ❌ (Number instead of string)

Return a JSON array with this format:
[
  {
    "questionNumber": "1",
    "matches": [
      {
        "chapterId": "5afd0da8-9afc-4b05-85c7-11542132639a",
        "chapterNumber": 5,
        "confidence": 0.95,
        "isPrimary": true,
        "reasoning": "Question tests concepts from this chapter based on PDF content"
      }
    ]
  }
]

**Rules:**
1. confidence should be a number from 0.00 to 1.00 (1.00 = perfect match)
2. Only include matches with confidence >= 0.60
3. Mark ONE chapter as isPrimary: true (the best match)
4. **CRITICAL:** chapterId MUST be the full UUID string from the reference list (e.g., "5afd0da8-9afc-4b05-85c7-11542132639a")
5. chapterNumber should be the integer chapter number (e.g., 5)
6. reasoning should explain what content in the PDF matched the question
7. If a question doesn't match any chapter well, return empty matches array

Return ONLY the JSON array, no other text.`;

  try {
    console.log(`Tagging ${questions.length} questions with ${chapters.length} chapters using full PDF...`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: CHAPTER_TAGGING_PROMPT },
              {
                inline_data: {
                  mime_type: 'application/pdf',
                  data: base64Pdf
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          }
        }),
      }
    );

    if (!response.ok) {
      console.error("Chapter tagging AI failed:", response.status);
      return {
        taggedCount: 0,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
      };
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error("No response from chapter tagging AI");
      return {
        taggedCount: 0,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
      };
    }

    // Extract token usage
    const usageMetadata = data?.usageMetadata || {};
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const completionTokens = usageMetadata.candidatesTokenCount || 0;
    const totalTokensUsed = usageMetadata.totalTokenCount || (promptTokens + completionTokens);

    // Calculate cost
    const inputCost = (promptTokens / 1000000) * 0.075;
    const outputCost = (completionTokens / 1000000) * 0.30;
    const totalCost = inputCost + outputCost;

    let jsonText = rawText.trim();

    // Clean markdown if present
    if (jsonText.includes('```')) {
      const match = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) {
        jsonText = match[1].trim();
      }
    }

    const taggingResults = JSON.parse(jsonText);

    console.log('AI returned tagging results:', JSON.stringify(taggingResults, null, 2));

    if (!Array.isArray(taggingResults)) {
      console.error("AI response is not an array");
      return {
        taggedCount: 0,
        tokenUsage: { promptTokens, completionTokens, totalTokens: totalTokensUsed, cost: totalCost }
      };
    }

    // Create mapping from chapter number to UUID for validation
    const chapterNumberToUuid = new Map<number, string>();
    chapters.forEach(ch => {
      chapterNumberToUuid.set(ch.chapter_number, ch.id);
    });

    console.log('Chapter number to UUID mapping:', Array.from(chapterNumberToUuid.entries()));

    // Save tags to database
    let taggedCount = 0;

    for (const result of taggingResults) {
      if (!result.matches || result.matches.length === 0) {
        console.log(`No chapter matches for question ${result.questionNumber}`);
        continue;
      }

      // Get the question ID from database using exam_paper_id and question_number
      const { data: dbQuestion } = await supabase
        .from('exam_questions')
        .select('id')
        .eq('exam_paper_id', examPaperId)
        .eq('question_number', String(result.questionNumber))
        .single();

      if (!dbQuestion) {
        console.warn(`Could not find database record for question ${result.questionNumber} in exam ${examPaperId}`);
        continue;
      }

      console.log(`Found question ${result.questionNumber} with ID: ${dbQuestion.id}`);

      // Update syllabus_id on the question
      const { error: updateError } = await supabase
        .from('exam_questions')
        .update({ syllabus_id: syllabusId })
        .eq('id', dbQuestion.id);

      if (updateError) {
        console.error(`Failed to update syllabus_id for question ${result.questionNumber}:`, updateError);
      }

      // Insert chapter tags
      for (const match of result.matches) {
        // Validate and clean the data before insertion
        const confidenceScore = parseFloat(String(match.confidence));

        // Validate confidence score is a valid number between 0 and 1
        if (isNaN(confidenceScore) || confidenceScore < 0 || confidenceScore > 1) {
          console.error(`Invalid confidence score for Q${result.questionNumber}: ${match.confidence}`);
          continue;
        }

        // Validate and fix chapter_id
        let chapterId = match.chapterId;

        // Check if chapterId is a number or looks like a chapter number instead of UUID
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(chapterId));

        if (!isUuid) {
          // AI returned chapter number instead of UUID - try to map it
          const chapterNum = parseInt(String(chapterId));
          if (!isNaN(chapterNum) && chapterNumberToUuid.has(chapterNum)) {
            const mappedUuid = chapterNumberToUuid.get(chapterNum)!;
            console.warn(`⚠️ AI returned chapter number ${chapterNum} instead of UUID. Mapping to: ${mappedUuid}`);
            chapterId = mappedUuid;
          } else {
            console.error(`❌ Invalid chapter ID for Q${result.questionNumber}: "${match.chapterId}" - not a UUID and couldn't map to chapter number`);
            continue;
          }
        }

        // Verify the UUID exists in our chapters list
        const chapterExists = chapters.some(ch => ch.id === chapterId);
        if (!chapterExists) {
          console.error(`❌ Chapter UUID ${chapterId} not found in syllabus chapters for Q${result.questionNumber}`);
          continue;
        }

        const insertData = {
          question_id: dbQuestion.id,
          chapter_id: chapterId,
          confidence_score: confidenceScore,
          is_primary: Boolean(match.isPrimary),
          match_reasoning: match.reasoning ? String(match.reasoning) : null,
          is_manually_set: false
        };

        console.log(`Inserting tag for Q${result.questionNumber}:`, JSON.stringify(insertData));

        const { error } = await supabase
          .from('question_chapter_tags')
          .insert(insertData);

        if (error) {
          console.error(`Failed to tag question ${result.questionNumber} with chapter:`, error);
          console.error(`Match data was:`, JSON.stringify(match));
        } else {
          console.log(`✅ Tagged Q${result.questionNumber} with Chapter ${match.chapterNumber} (UUID: ${chapterId}, confidence: ${confidenceScore})`);
        }
      }

      taggedCount++;
    }

    return {
      taggedCount,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens: totalTokensUsed,
        cost: totalCost
      }
    };

  } catch (error) {
    console.error("Failed to tag questions with chapters:", error);
    return {
      taggedCount: 0,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
    };
  }
}

/**
 * Helper function to convert ArrayBuffer to base64 in chunks (avoids stack overflow)
 */
async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192; // Process 8KB at a time
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}