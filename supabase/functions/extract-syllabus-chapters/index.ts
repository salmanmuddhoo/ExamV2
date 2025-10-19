import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};
Deno.serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  try {
    console.log('Extract syllabus chapters function invoked');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return new Response(JSON.stringify({
        error: 'Server configuration error'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { syllabusId, fileUrl } = await req.json();
    console.log(`Request received - syllabusId: ${syllabusId}, fileUrl: ${fileUrl}`);
    if (!syllabusId || !fileUrl) {
      console.error('Missing required fields');
      return new Response(JSON.stringify({
        error: 'Missing required fields'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const geminiApiKey = Deno.env.get('GEMINI_UPLOAD_API_KEY') || Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      console.error('GEMINI API key not configured');
      return new Response(JSON.stringify({
        error: 'GEMINI_UPLOAD_API_KEY or GEMINI_API_KEY not configured'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Extracting chapters from syllabus: ${syllabusId}`);
    // Update status to processing
    await supabase.from('syllabus').update({
      processing_status: 'processing'
    }).eq('id', syllabusId);
    // Fetch the PDF file
    console.log('Fetching PDF from URL...');
    const pdfResponse = await fetch(fileUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
    }
    const pdfBlob = await pdfResponse.blob();
    console.log(`PDF fetched, size: ${pdfBlob.size} bytes`);
    // Convert to base64 in chunks to avoid stack overflow
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const base64Pdf = await arrayBufferToBase64(arrayBuffer);
    console.log('PDF converted to base64');
    // Use Gemini to analyze the syllabus directly with inline_data (simpler than File API)
    const prompt = `Analyze this syllabus PDF and intelligently extract all chapters with their hierarchical structure.

ANALYSIS INSTRUCTIONS:
1. Identify the main content section (often called "Subject content", "Course content", "Syllabus content", etc.)
2. Recognize the chapter numbering system used (could be 1, 2, 3... or A, B, C... or I, II, III... or Chapter 1, Chapter 2, etc.)
3. Identify subtopics - these are typically numbered as decimals (1.1, 1.2) or letters (1a, 1b) or roman numerals (i, ii, iii)
4. Do NOT create artificial hierarchy - extract only what's explicitly structured in the document
5. Ignore introductory sections like "Why choose this syllabus", "Assessment overview", "How to use this syllabus", etc.

CHAPTER IDENTIFICATION RULES:
- A chapter is a MAJOR section with a main heading/title
- Chapters are typically numbered sequentially at the top level
- Subtopics are secondary divisions WITHIN a chapter
- Look for consistent formatting patterns (font size, numbering style, indentation)
- Common patterns:
  * "1 Chapter Title" with subtopics "1.1", "1.2", "1.3"
  * "Chapter 1: Title" with subtopics "1.1", "1.2"
  * "Topic 1 - Title" with subtopics "1a", "1b"
  * Lettered chapters "A. Title" with subtopics "A.1", "A.2"

WHAT TO EXTRACT:
For each chapter:
1. Chapter number (extract the main identifier - number, letter, or roman numeral)
2. Chapter title (the main heading text)
3. Brief description (summarize what the chapter covers based on the content you see)
4. List of subtopics with their full identifiers and titles (e.g., "1.1 Number systems", "2.3 Encryption")

WHAT TO IGNORE:
- Front matter (introduction, aims, assessment overview)
- Back matter (appendices, glossaries, command words)
- Assessment details sections
- Administrative information
- Example questions or specimen papers

Return ONLY valid JSON in this exact format (no markdown, no code blocks, just pure JSON):
{
  "chapters": [
    {
      "number": "1",
      "title": "Chapter Title Here",
      "description": "Brief 1-2 sentence description of what this chapter covers",
      "subtopics": [
        "1.1 First subtopic title",
        "1.2 Second subtopic title",
        "1.3 Third subtopic title"
      ],
      "confidence": 0.95
    },
    {
      "number": "2",
      "title": "Next Chapter Title",
      "description": "Brief description",
      "subtopics": [
        "2.1 Subtopic title",
        "2.2 Another subtopic"
      ],
      "confidence": 0.90
    }
  ],
  "metadata": {
    "total_chapters": 10,
    "subject": "Subject name if identifiable from the document",
    "level": "O Level, A Level, IGCSE, etc. if identifiable",
    "syllabus_code": "Code if visible (e.g., 2210, 9618, etc.)",
    "numbering_system": "Description of how chapters are numbered (e.g., 'Sequential numbers 1-10', 'Letters A-F', etc.)",
    "notes": "Any important observations about the structure or extraction"
  }
}

QUALITY REQUIREMENTS:
- Set confidence between 0-1 based on clarity of chapter boundaries
- If subtopics aren't clearly defined, use empty array []
- Maintain the EXACT numbering from the document (don't renumber)
- Extract ALL main chapters from the content section
- Be precise with titles - use exact text from the document
- If uncertain about chapter boundaries, note this in confidence score and metadata

IMPORTANT: Focus on extracting the actual teaching/learning content structure, not administrative sections. Look for the section that contains the actual subject matter to be taught.`;
    console.log('Sending PDF to Gemini for analysis...');
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              },
              {
                inline_data: {
                  mime_type: 'application/pdf',
                  data: base64Pdf
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192
        }
      })
    });
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${errorText}`);
    }
    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Gemini response received');
    // Parse JSON from response
    let extractedData;
    try {
      // Remove markdown code blocks if present
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      console.log('Cleaned response text:', cleanedText.substring(0, 500));
      extractedData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse JSON from Gemini response:', responseText);
      throw new Error('Could not extract valid JSON from AI response');
    }
    // Validate extracted data
    if (!extractedData.chapters || !Array.isArray(extractedData.chapters)) {
      console.error('Invalid response format:', extractedData);
      throw new Error('Invalid response format: missing chapters array');
    }
    console.log(`Extracted ${extractedData.chapters.length} chapters`);
    // Store extracted chapters
    if (extractedData.chapters.length > 0) {
      // First, delete ALL existing chapters for this syllabus
      console.log('Deleting existing chapters for syllabus:', syllabusId);
      const { error: deleteError, count } = await supabase.from('syllabus_chapters').delete({
        count: 'exact'
      }).eq('syllabus_id', syllabusId);
      if (deleteError) {
        console.error('Error deleting existing chapters:', deleteError);
        throw new Error(`Failed to delete existing chapters: ${deleteError.message}`);
      }
      console.log(`Deleted ${count || 0} existing chapters`);
      // Small delay to ensure delete is committed
      await new Promise((resolve)=>setTimeout(resolve, 100));
      const chaptersToInsert = extractedData.chapters.map((chapter, index)=>{
        // Ensure subtopics is always a proper string array
        let subtopics = [];
        if (Array.isArray(chapter.subtopics)) {
          subtopics = chapter.subtopics.map((s)=>String(s)).filter((s)=>s.trim().length > 0);
        }
        // Use display_order (index + 1) as chapter_number to avoid duplicates
        // AI might return duplicate chapter numbers for hierarchical content
        const chapterNumber = index + 1;
        // Ensure confidence_score is a valid decimal (0-1)
        let confidenceScore = 0.9;
        if (typeof chapter.confidence === 'number' && chapter.confidence >= 0 && chapter.confidence <= 1) {
          confidenceScore = chapter.confidence;
        }
        return {
          syllabus_id: syllabusId,
          chapter_number: chapterNumber,
          chapter_title: String(chapter.title || `Chapter ${index + 1}`),
          chapter_description: chapter.description ? String(chapter.description) : null,
          subtopics: subtopics,
          display_order: index + 1,
          confidence_score: confidenceScore
        };
      });
      console.log('Chapters to insert:', JSON.stringify(chaptersToInsert, null, 2));
      const { data: insertedData, error: chaptersError } = await supabase.from('syllabus_chapters').insert(chaptersToInsert).select();
      if (chaptersError) {
        console.error('Error inserting chapters:', chaptersError);
        console.error('Attempted to insert:', JSON.stringify(chaptersToInsert, null, 2));
        throw new Error(`Database insert failed: ${chaptersError.message} (${chaptersError.code})`);
      }
      console.log(`Successfully inserted ${insertedData?.length || chaptersToInsert.length} chapters`);
      // Update status to completed
      await supabase.from('syllabus').update({
        processing_status: 'completed',
        extraction_metadata: extractedData.metadata || {}
      }).eq('id', syllabusId);
      console.log('Chapters saved successfully');
      return new Response(JSON.stringify({
        success: true,
        chapters: extractedData.chapters,
        metadata: extractedData.metadata
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } else {
      throw new Error('No chapters extracted from syllabus');
    }
  } catch (error) {
    console.error('Error extracting syllabus chapters:', error);
    console.error('Error stack:', error.stack);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to extract chapters',
      details: error.toString()
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
// Helper function to convert ArrayBuffer to base64 in chunks (avoids stack overflow)
async function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192; // Process 8KB at a time
  let binary = '';
  for(let i = 0; i < bytes.length; i += chunkSize){
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
} // No additional helper functions needed - using inline_data instead of File API
