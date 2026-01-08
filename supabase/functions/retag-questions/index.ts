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

  console.log('=== Chapter Tagging Debug Info ===');
  console.log('Total chapters available:', chapters.length);
  console.log('Chapter info being sent to AI:');
  chapterInfo.forEach(ch => {
    console.log(`  - UUID: ${ch.id} | Chapter ${ch.number}: ${ch.title}`);
  });
  console.log('Total questions to tag:', questions.length);
  console.log('===================================');

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

    // Create mapping from chapter number to UUID for validation
    const chapterNumberToUuid = new Map<number, string>();
    chapters.forEach(ch => {
      chapterNumberToUuid.set(ch.chapter_number, ch.id);
    });

    console.log('Chapter number to UUID mapping:', Array.from(chapterNumberToUuid.entries()));

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
          console.error(`   Available chapter UUIDs:`);
          chapters.forEach(ch => {
            console.error(`   - ${ch.id} (Chapter ${ch.chapter_number}: ${ch.chapter_title})`);
          });
          console.error(`   AI may have hallucinated this UUID or used wrong syllabus`);
          continue;
        }

        // Validate confidence score
        const confidenceScore = parseFloat(String(match.confidence));
        if (isNaN(confidenceScore) || confidenceScore < 0 || confidenceScore > 1) {
          console.error(`Invalid confidence score for Q${result.questionNumber}: ${match.confidence}`);
          continue;
        }

        const insertData = {
          question_id: question.id,
          chapter_id: chapterId,
          confidence_score: confidenceScore,
          is_primary: match.isPrimary || false,
          match_reasoning: match.reasoning,
          is_manually_set: false
        };

        console.log(`Inserting tag for Q${result.questionNumber}:`, JSON.stringify(insertData));

        const { error } = await supabase.from('question_chapter_tags').insert(insertData);

        if (error) {
          console.error(`Error inserting tag for question ${result.questionNumber}:`, error);
        } else {
          console.log(`✅ Tagged Q${result.questionNumber} with Chapter ${match.chapterNumber} (UUID: ${chapterId}, confidence: ${confidenceScore})`);
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
