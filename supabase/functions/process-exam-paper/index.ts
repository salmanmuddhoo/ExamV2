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

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    console.log(`Analyzing ${pageImages.length} pages with Gemini...`);

    const questions = await extractAndSplitQuestions(pageImages, geminiApiKey);
    
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
    if (markingSchemeImages && markingSchemeImages.length > 0) {
      console.log(`Extracting marking scheme for ${questions.length} questions...`);
      markingSchemeData = await extractMarkingScheme(
        questions,
        markingSchemeImages,
        geminiApiKey
      );
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

    return new Response(
      JSON.stringify({
        success: true,
        questionsCount: savedQuestions.length,
        questions: savedQuestions.map(q => ({
          number: q.questionNumber,
          pages: q.pageNumbers,
          imageCount: q.imageUrls.length,
          preview: q.fullText.substring(0, 100) + '...'
        }))
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
  geminiApiKey: string
) {
  
  const imageParts = pageImages.map(page => ({
    inline_data: {
      mime_type: "image/jpeg",
      data: page.base64Image
    }
  }));

  const AI_PROMPT=`You are an AI that analyzes scanned exam papers to detect and segment individual questions from the image.

Your task: Extract and split all questions from this exam paper, returning both text and approximate image crop coordinates.

**CRITICAL INSTRUCTIONS:**
1. Return ONLY a JSON array — no other text.
2. Each item must represent ONE question.
3. Keep "fullText" SHORT — only the first 100 characters.
4. Include estimated "cropBox" coordinates in percentages (not pixels), to mark where the question appears on the page image.
5. Format:
[
  {
    "questionNumber": "1",
    "startPage": 1,
    "endPage": 2,
    "fullText": "Question 1: ...",
    "hasSubParts": false,
    "cropBox": { "top": 0.10, "left": 0.08, "width": 0.85, "height": 0.25 }
  }
]

**IMPORTANT FOR MULTI-PAGE QUESTIONS:**
- Look CAREFULLY at where each question ENDS.
- A question continues to the NEXT page if no new question number appears.
- If page 2 starts "Question 2" but page 3 doesn’t start "Question 3", then Question 2 spans BOTH pages 2 AND 3.
- Set startPage = first page of question, endPage = last page of question.

**WHAT TO LOOK FOR:**
- "Question 1", "Q1", "1.", or "1)" patterns mark the START of a question.
- A new question number marks the END of the previous question.
- If no new number appears, the question continues.
- Estimate visual crop boundaries where question text starts and ends on each page.

**VISUAL CROP INSTRUCTIONS:**
- The field called 'cropBox' gives the approximate rectangular area for each question.
- Use normalized values (0 to 1) relative to the full page size.
  Example:
  - top=0 means top of page, top=1 means bottom of page
  - left=0 means left edge, left=1 means right edge
- Only include the area where the question text appears (no extra margins).

**Example:**
Page 1: "Question 1: Calculate..."
Page 2: "...continued from Q1"
Page 3: "Question 2: Explain..."
→ Result:
[
  {
    "questionNumber": "1",
    "startPage": 1,
    "endPage": 2,
    "fullText": "Question 1: Calculate the derivative...",
    "hasSubParts": true,
    "cropBox": { "top": 0.05, "left": 0.07, "width": 0.88, "height": 0.40 }
  },
  {
    "questionNumber": "2",
    "startPage": 3,
    "endPage": 3,
    "fullText": "Question 2: Explain the process...",
    "hasSubParts": false,
    "cropBox": { "top": 0.15, "left": 0.08, "width": 0.85, "height": 0.30 }
  }
]

**Return ONLY the JSON array.**
`;



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
            maxOutputTokens: 16384,
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
    
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      console.warn(`Response may be incomplete. Finish reason: ${finishReason}`);
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

    let questions;
    try {
      questions = JSON.parse(jsonText);
      console.log(`Successfully parsed ${questions.length} questions`);
    } catch (parseError) {
      console.error("JSON parse error:", parseError.message);
      
      try {
        const lastCompleteMatch = jsonText.match(/\{[^}]*\}(?=\s*,|\s*\])/g);
        
        if (lastCompleteMatch && lastCompleteMatch.length > 0) {
          const salvaged = '[' + lastCompleteMatch.join(',') + ']';
          questions = JSON.parse(salvaged);
          console.log(`Salvaged ${questions.length} complete questions from truncated response`);
        } else {
          throw parseError;
        }
      } catch (salvageError) {
        throw new Error(`JSON parse failed. The response may be too large or malformed.`);
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
    return validQuestions;

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
  geminiApiKey: string
): Promise<Map<string, string>> {
  
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
      return new Map();
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawText) {
      console.error("No marking scheme response");
      return new Map();
    }

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

    return resultMap;

  } catch (error) {
    console.error("Failed to extract marking scheme:", error);
    return new Map();
  }
}