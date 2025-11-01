import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RetagRequest {
  examPaperId: string;
  syllabusId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { examPaperId, syllabusId }: RetagRequest = await req.json();

    if (!examPaperId || !syllabusId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_UPLOAD_API_KEY') || Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error("GEMINI_UPLOAD_API_KEY or GEMINI_API_KEY not configured");
    }

    console.log(`Re-tagging questions for exam paper ${examPaperId} with syllabus ${syllabusId}`);

    // Step 1: Get all questions for this exam paper
    const { data: questions, error: questionsError } = await supabase
      .from('exam_questions')
      .select('id, question_number, ocr_text')
      .eq('exam_paper_id', examPaperId);

    if (questionsError) throw questionsError;

    if (!questions || questions.length === 0) {
      console.log('No questions found for this exam paper');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No questions to re-tag',
          taggedCount: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${questions.length} questions to re-tag`);

    // Step 2: Get syllabus with file URL and chapters
    const { data: syllabus, error: syllabusError } = await supabase
      .from('syllabus')
      .select('id, file_url, syllabus_chapters(id, chapter_number, chapter_title, chapter_description, subtopics)')
      .eq('id', syllabusId)
      .eq('processing_status', 'completed')
      .single();

    if (syllabusError) throw syllabusError;

    if (!syllabus || !syllabus.file_url) {
      console.log('Syllabus not found or missing PDF file');
      return new Response(
        JSON.stringify({ error: 'Syllabus not found or missing PDF file' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!syllabus.syllabus_chapters || syllabus.syllabus_chapters.length === 0) {
      console.log('No chapters found for this syllabus');
      return new Response(
        JSON.stringify({ error: 'Syllabus has no chapters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found syllabus with ${syllabus.syllabus_chapters.length} chapters`);

    // Step 3: Delete existing tags for these questions
    const questionIds = questions.map(q => q.id);
    const { error: deleteError } = await supabase
      .from('question_chapter_tags')
      .delete()
      .in('question_id', questionIds);

    if (deleteError) {
      console.error('Error deleting old tags:', deleteError);
      throw deleteError;
    }

    console.log(`Deleted old chapter tags for ${questionIds.length} questions`);

    // Step 4: Tag questions with new chapters using AI and full PDF
    const taggingResult = await tagQuestionsWithChapters(
      examPaperId,
      questions,
      syllabus.syllabus_chapters,
      syllabus.id,
      syllabus.file_url,
      supabase,
      geminiApiKey
    );

    console.log(`Successfully re-tagged ${taggingResult.taggedCount} questions`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully re-tagged ${taggingResult.taggedCount} questions`,
        taggedCount: taggingResult.taggedCount,
        tokenUsage: taggingResult.tokenUsage
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Re-tagging error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to re-tag questions" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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

  // Build question information for AI
  const questionInfo = questions.map(q => ({
    number: q.question_number,
    text: q.ocr_text || ''
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

**REFERENCE CHAPTERS:**
${chapterInfo.map(ch => `ID: ${ch.id}
Chapter ${ch.number}: ${ch.title}`).join('\n\n')}

**QUESTIONS:**
${questionInfo.map(q => `Question ${q.number}: ${q.text}`).join('\n\n')}

**Task:**
Read the FULL SYLLABUS PDF provided and compare each question against the COMPLETE CONTENT of each chapter in the PDF.
For each question, identify which chapter(s) it belongs to by reading the detailed content, subtopics, and learning objectives in the PDF.

**Instructions:**
1. Read through the ENTIRE syllabus PDF to understand all chapter content
2. For each question, carefully compare it against the full chapter content in the PDF (not just the titles above)
3. Match questions to chapters based on the detailed content, subtopics, and concepts in the PDF
4. A question may relate to multiple chapters if it spans multiple topics
5. Use the chapter reference list above ONLY to get the correct chapter IDs - the PDF is your source for content matching

**IMPORTANT:** Use the EXACT chapter IDs from the "Reference Chapters" list above. Match the chapter numbers from the PDF to the IDs in the list.

Return a JSON array with this format:
[
  {
    "questionNumber": "1",
    "matches": [
      {
        "chapterId": "<exact-uuid-from-ID-field>",
        "chapterNumber": 1,
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
4. **CRITICAL:** Use the EXACT chapter UUID from the reference list above
5. reasoning should explain what content in the PDF matched the question
6. If a question doesn't match any chapter well, return empty matches array
7. chapterNumber should be the integer chapter number

Return ONLY the JSON array, no other text.`;

  try {
    console.log(`Tagging ${questions.length} questions with ${chapters.length} chapters using full PDF...`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: CHAPTER_TAGGING_PROMPT,
                },
                {
                  inline_data: {
                    mime_type: 'application/pdf',
                    data: base64Pdf
                  }
                }
              ],
            },
          ],
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
      console.error("No text in AI response");
      return {
        taggedCount: 0,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
      };
    }

    // Parse JSON from response
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Could not extract JSON from AI response");
      return {
        taggedCount: 0,
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
      };
    }

    const taggingResults = JSON.parse(jsonMatch[0]);
    console.log(`AI returned tagging for ${taggingResults.length} questions`);

    // Save tags to database
    let taggedCount = 0;

    for (const result of taggingResults) {
      // Find the question in our database
      const question = questions.find(q => q.question_number === result.questionNumber);
      if (!question) {
        console.warn(`Question ${result.questionNumber} not found in database`);
        continue;
      }

      if (!result.matches || result.matches.length === 0) {
        console.log(`Question ${result.questionNumber} has no chapter matches`);
        continue;
      }

      // Insert tags for each match
      for (const match of result.matches) {
        const { error } = await supabase.from('question_chapter_tags').insert({
          question_id: question.id,
          chapter_id: match.chapterId,
          confidence_score: match.confidence,
          is_primary: match.isPrimary || false,
          match_reasoning: match.reasoning,
          is_manually_set: false
        });

        if (error) {
          console.error(`Error inserting tag for question ${result.questionNumber}:`, error);
        } else {
          taggedCount++;
        }
      }
    }

    // Calculate token usage
    const usage = data?.usageMetadata;
    const tokenUsage = {
      promptTokens: usage?.promptTokenCount || 0,
      completionTokens: usage?.candidatesTokenCount || 0,
      totalTokens: usage?.totalTokenCount || 0,
      cost: 0 // Calculate if needed
    };

    return { taggedCount, tokenUsage };

  } catch (error) {
    console.error("Error in tagQuestionsWithChapters:", error);
    throw error;
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
