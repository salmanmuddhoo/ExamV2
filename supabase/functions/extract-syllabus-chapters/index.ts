import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};

// Helper function to fetch admin upload model from system settings
async function getAdminUploadModel(supabase: any): Promise<{ model_name: string; provider: string }> {
  try {
    // Fetch the admin upload model ID from system settings
    const { data: settingData, error: settingError } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'admin_upload_model')
      .maybeSingle();

    if (settingError || !settingData) {
      console.log('No admin upload model configured, using default');
      return { model_name: 'gemini-2.5-flash-latest', provider: 'gemini' };
    }

    const modelId = settingData.setting_value as string;

    // Fetch the model details
    const { data: modelData, error: modelError } = await supabase
      .from('ai_models')
      .select('model_name, provider')
      .eq('id', modelId)
      .single();

    if (modelError || !modelData) {
      console.error('Error fetching model details:', modelError);
      return { model_name: 'gemini-2.5-flash-latest', provider: 'gemini' };
    }

    return {
      model_name: modelData.model_name,
      provider: modelData.provider
    };
  } catch (err) {
    console.error('Error in getAdminUploadModel:', err);
    return { model_name: 'gemini-2.5-flash-latest', provider: 'gemini' };
  }
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

    // Fetch the admin upload model from system settings
    const adminModel = await getAdminUploadModel(supabase);
    console.log(`Using AI model: ${adminModel.model_name} (${adminModel.provider})`);

    // Fetch custom AI prompt if specified for this syllabus
    let customPrompt: string | null = null;
    try {
      const { data: syllabusData, error: syllabusError } = await supabase
        .from('syllabus')
        .select('ai_prompt_id')
        .eq('id', syllabusId)
        .single();

      if (!syllabusError && syllabusData?.ai_prompt_id) {
        console.log(`Fetching custom AI prompt: ${syllabusData.ai_prompt_id}`);
        const { data: promptData, error: promptError } = await supabase
          .from('ai_prompts')
          .select('system_prompt')
          .eq('id', syllabusData.ai_prompt_id)
          .single();

        if (!promptError && promptData) {
          customPrompt = promptData.system_prompt;
          console.log('Using custom AI prompt for extraction');
        }
      }
    } catch (err) {
      console.error('Error fetching custom prompt, using default:', err);
    }

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

    // Use custom prompt if available, otherwise use default
    const prompt = customPrompt || `Analyze this syllabus PDF and intelligently extract all chapters with their hierarchical structure.

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
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${adminModel.model_name}:generateContent?key=${geminiApiKey}`, {
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

    // Extract token usage and calculate cost
    const usageMetadata = geminiData?.usageMetadata || {};
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const completionTokens = usageMetadata.candidatesTokenCount || 0;
    const totalTokens = usageMetadata.totalTokenCount || (promptTokens + completionTokens);

    // Fetch dynamic pricing from database
    const modelName = adminModel.model_name;
    const pricing = await getModelPricing(supabase, modelName);

    // Calculate cost using database pricing
    const inputCost = (promptTokens / 1000000) * pricing.inputCost;
    const outputCost = (completionTokens / 1000000) * pricing.outputCost;
    const totalCost = inputCost + outputCost;

    console.log(`Token usage: ${totalTokens} tokens (input: ${promptTokens}, output: ${completionTokens}), cost: $${totalCost.toFixed(6)}`);
    // Parse JSON from response
    let extractedData;
    try {
      // Remove markdown code blocks if present - try multiple approaches
      let cleanedText = responseText.trim();

      // Method 1: Remove code fences with regex
      cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

      // Method 2: If still has backticks, try extracting JSON manually
      if (cleanedText.startsWith('```')) {
        const match = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match) {
          cleanedText = match[1].trim();
        } else {
          // Last resort: remove all backticks
          cleanedText = cleanedText.replace(/```/g, '').trim();
        }
      }

      // Method 3: Extract only the JSON object/array
      const jsonMatch = cleanedText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        cleanedText = jsonMatch[1];
      }

      console.log('Cleaned response text (first 500 chars):', cleanedText.substring(0, 500));
      console.log('Cleaned response text (last 100 chars):', cleanedText.substring(Math.max(0, cleanedText.length - 100)));

      extractedData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse JSON from Gemini response:', parseError.message);
      console.error('First 1000 chars of original response:', responseText.substring(0, 1000));
      console.error('Last 500 chars of original response:', responseText.substring(Math.max(0, responseText.length - 500)));
      throw new Error(`Could not extract valid JSON from AI response: ${parseError.message}`);
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

      // Log token usage to database for analytics
      try {
        await supabase.from('token_usage_logs').insert({
          syllabus_id: syllabusId,
          model: modelName,
          provider: adminModel.provider,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          estimated_cost: totalCost,
          is_follow_up: false,
          operation_type: 'syllabus_extraction',
          source: 'syllabus_upload'
        });
        console.log('✅ Token usage saved to database');
      } catch (logError) {
        console.error('Failed to log token usage:', logError);
        // Don't fail the whole operation if logging fails
      }
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
