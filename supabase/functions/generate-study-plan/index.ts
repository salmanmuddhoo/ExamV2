import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateAIResponse, getUserAIModel, getDefaultAIModel, type AIModelConfig } from "./ai-providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey"
};

interface StudyPlanRequest {
  schedule_id: string;
  user_id: string;
  subject_id: string;
  grade_id: string;
  syllabus_id?: string; // Optional: specific syllabus to use
  chapter_ids?: string[]; // Optional: specific chapters to include
  study_duration_minutes: number;
  selected_days?: string[]; // Selected days of the week (e.g., ['monday', 'wednesday', 'friday'])
  preferred_times: string[];
  start_date: string;
  end_date: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("📋 CORS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("🚀 Study Plan Generation Started");
  console.log("⏰ Timestamp:", new Date().toISOString());

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("❌ Missing authorization header");
      throw new Error("Missing authorization header");
    }
    console.log("✅ Authorization header present");

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    console.log("🔧 Supabase URL:", supabaseUrl);

    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    console.log("✅ Supabase client created");

    // Get request body
    const requestData: StudyPlanRequest = await req.json();
    console.log("📦 Request data received:", JSON.stringify(requestData, null, 2));

    const {
      schedule_id,
      user_id,
      subject_id,
      grade_id,
      syllabus_id,
      chapter_ids,
      study_duration_minutes,
      selected_days = ['monday', 'wednesday', 'friday'], // Default to MWF if not provided
      preferred_times,
      start_date,
      end_date
    } = requestData;

    console.log("📝 Parsed parameters:");
    console.log("  - Schedule ID:", schedule_id);
    console.log("  - User ID:", user_id);
    console.log("  - Subject ID:", subject_id);
    console.log("  - Grade ID:", grade_id);
    console.log("  - Syllabus ID:", syllabus_id || "Auto-detect from subject/grade");
    console.log("  - Chapter IDs:", chapter_ids || "All chapters");
    console.log("  - Duration:", study_duration_minutes, "minutes");
    console.log("  - Selected days:", selected_days.join(', '));
    console.log("  - Preferred times:", preferred_times);
    console.log("  - Date range:", start_date, "to", end_date);

    // CRITICAL: Verify the schedule exists before proceeding
    console.log("🔍 Verifying schedule exists in database...");
    const { data: scheduleCheck, error: scheduleCheckError } = await supabaseClient
      .from('study_plan_schedules')
      .select('id, user_id')
      .eq('id', schedule_id)
      .single();

    if (scheduleCheckError || !scheduleCheck) {
      console.error("❌ Schedule not found:", schedule_id);
      console.error("Error details:", scheduleCheckError);
      throw new Error(`Schedule with ID ${schedule_id} not found in database. This may be due to a race condition or the schedule was deleted.`);
    }

    if (scheduleCheck.user_id !== user_id) {
      console.error("❌ User ID mismatch!");
      throw new Error("User ID mismatch: schedule belongs to different user");
    }

    console.log("✅ Schedule verified successfully");

    // Fetch subject and grade names
    console.log("🔍 Fetching subject and grade information...");
    const { data: subject, error: subjectError } = await supabaseClient
      .from('subjects')
      .select('name')
      .eq('id', subject_id)
      .single();

    if (subjectError) {
      console.error("❌ Error fetching subject:", subjectError);
    } else {
      console.log("✅ Subject found:", subject?.name);
    }

    const { data: grade, error: gradeError } = await supabaseClient
      .from('grade_levels')
      .select('name')
      .eq('id', grade_id)
      .single();

    if (gradeError) {
      console.error("❌ Error fetching grade:", gradeError);
    } else {
      console.log("✅ Grade found:", grade?.name);
    }

    const subjectName = subject?.name || 'Subject';
    const gradeName = grade?.name || 'Grade';

    // Fetch syllabus chapters for the subject
    console.log("🔍 Fetching syllabus and chapters...");
    let syllabusQuery = supabaseClient
      .from('syllabus')
      .select('id, file_url');

    // If syllabus_id is provided, use it directly; otherwise find by subject/grade
    if (syllabus_id) {
      console.log("📋 Using provided syllabus ID:", syllabus_id);
      syllabusQuery = syllabusQuery.eq('id', syllabus_id);
    } else {
      console.log("📋 Auto-detecting syllabus from subject/grade");
      syllabusQuery = syllabusQuery
        .eq('subject_id', subject_id)
        .eq('grade_id', grade_id);
    }

    const { data: syllabusData, error: syllabusError } = await syllabusQuery.single();

    if (syllabusError) {
      console.warn("⚠️ No syllabus found:", syllabusError.message);
      console.log("📝 Will generate study plan without specific chapters");
    } else {
      console.log("✅ Syllabus found:", syllabusData.id);
      console.log("📄 Syllabus PDF URL:", syllabusData.file_url || "No PDF file");
    }

    let chapters: any[] = [];
    let syllabusPdfBase64: string | null = null;

    if (syllabusData) {
      let chaptersQuery = supabaseClient
        .from('syllabus_chapters')
        .select('id, chapter_number, chapter_title, chapter_description, subtopics')
        .eq('syllabus_id', syllabusData.id);

      // Filter by specific chapter IDs if provided
      if (chapter_ids && chapter_ids.length > 0) {
        console.log(`🔍 Filtering for ${chapter_ids.length} specific chapters`);
        chaptersQuery = chaptersQuery.in('id', chapter_ids);
      }

      const { data: chaptersData, error: chaptersError } = await chaptersQuery.order('chapter_number');

      if (chaptersError) {
        console.error("❌ Error fetching chapters:", chaptersError);
      } else {
        chapters = chaptersData || [];
        console.log(`✅ Found ${chapters.length} chapter(s)`);
        if (chapter_ids && chapter_ids.length > 0) {
          console.log("📚 Creating study plan for selected chapters:");
        } else {
          console.log("📚 Creating study plan for all chapters:");
        }
        chapters.forEach(ch => {
          console.log(`   - Chapter ${ch.chapter_number}: ${ch.chapter_title}`);
        });
      }

      // Download the syllabus PDF for AI context
      if (syllabusData.file_url) {
        try {
          console.log("📥 Downloading syllabus PDF for AI context...");
          const pdfResponse = await fetch(syllabusData.file_url);

          if (!pdfResponse.ok) {
            console.warn("⚠️ Failed to download PDF:", pdfResponse.status);
          } else {
            const pdfArrayBuffer = await pdfResponse.arrayBuffer();
            const pdfBytes = new Uint8Array(pdfArrayBuffer);

            // Convert to base64 - process in chunks to avoid stack overflow
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < pdfBytes.length; i += chunkSize) {
              const chunk = pdfBytes.slice(i, i + chunkSize);
              binary += String.fromCharCode.apply(null, Array.from(chunk));
            }
            const base64 = btoa(binary);
            syllabusPdfBase64 = base64;
            console.log("✅ PDF downloaded and converted to base64");
            console.log(`📊 PDF size: ${(pdfBytes.length / 1024).toFixed(2)} KB`);
          }
        } catch (pdfError) {
          console.error("❌ Error downloading PDF:", pdfError);
          console.log("⚠️ Continuing without PDF context");
        }
      }
    }

    // Fetch existing events to avoid scheduling conflicts
    console.log("🔍 Fetching existing events to check for conflicts...");
    const { data: existingEvents, error: eventsError } = await supabaseClient
      .from('study_plan_events')
      .select('event_date, start_time, end_time, title')
      .eq('user_id', user_id)
      .gte('event_date', start_date)
      .lte('event_date', end_date);

    if (eventsError) {
      console.error("❌ Error fetching existing events:", eventsError);
    } else {
      console.log(`✅ Found ${existingEvents?.length || 0} existing events in date range`);
    }

    // Format busy time slots for AI
    let busyTimeSlots = '';
    if (existingEvents && existingEvents.length > 0) {
      busyTimeSlots = existingEvents.map(event =>
        `${event.event_date} from ${event.start_time} to ${event.end_time} (${event.title})`
      ).join('\n');
      console.log("📅 Busy time slots:\n", busyTimeSlots);
    } else {
      busyTimeSlots = 'No existing events - calendar is clear';
      console.log("📅 No existing events found - calendar is clear");
    }

    // Get user's preferred AI model
    console.log("🤖 Fetching user's preferred AI model...");
    let aiModel: AIModelConfig | null = await getUserAIModel(supabaseClient, user_id);

    if (!aiModel) {
      console.log("📋 No user preference found, using default model");
      aiModel = await getDefaultAIModel(supabaseClient);
    }

    console.log(`✅ Using AI model: ${aiModel.display_name} (${aiModel.provider})`);
    console.log(`   - Model: ${aiModel.model_name}`);
    console.log(`   - Vision: ${aiModel.supports_vision}`);
    console.log(`   - Caching: ${aiModel.supports_caching}`);

    // Prepare prompt for Gemini
    const isChapterSpecific = chapter_ids && chapter_ids.length > 0;

    let chaptersInfo = '';
    if (chapters && chapters.length > 0) {
      if (isChapterSpecific) {
        // For selected chapters, provide detailed information
        chaptersInfo = chapters.map(ch => {
          let info = `Chapter ${ch.chapter_number}: ${ch.chapter_title}`;
          if (ch.chapter_description) {
            info += `\n  Description: ${ch.chapter_description}`;
          }
          if (ch.subtopics && ch.subtopics.length > 0) {
            info += `\n  Subtopics: ${ch.subtopics.join(', ')}`;
          }
          return info;
        }).join('\n\n');
      } else {
        // For all chapters, provide basic information
        chaptersInfo = chapters.map(ch => `Chapter ${ch.chapter_number}: ${ch.chapter_title}`).join('\n');
      }
    } else {
      chaptersInfo = 'No specific chapters available';
    }

    const chapterScope = isChapterSpecific
      ? `Focus ONLY on the following selected chapters (${chapters.length} chapter(s)). Do NOT include any other chapters from the syllabus.`
      : `IMPORTANT: Cover ALL ${chapters.length} chapters systematically from the syllabus. The study plan must include sessions for EVERY chapter from start to finish. Distribute the chapters across the entire date range (${start_date} to ${end_date}) to ensure comprehensive coverage.`;

    console.log("📝 Preparing AI prompt...");
    console.log("📚 Chapters info length:", chaptersInfo.length);
    console.log("🎯 Chapter scope:", chapterScope);
    console.log("📄 Has PDF:", syllabusPdfBase64 ? 'Yes' : 'No');

    const syllabusContext = syllabusPdfBase64
      ? 'I have attached the complete syllabus document for reference.'
      : chapters.length > 0
      ? 'I have provided the chapter details below.'
      : 'No specific syllabus is available. Use your knowledge of the subject curriculum.';

    // Calculate study planning metrics
    const startDateObj = new Date(start_date);
    const endDateObj = new Date(end_date);
    const totalDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
    const weeksAvailable = Math.floor(totalDays / 7);
    const chaptersTocover = isChapterSpecific ? chapters.length : chapters.length;
    const planningContext = !isChapterSpecific && chapters.length > 0
      ? `\n\nPLANNING CONTEXT: You need to cover ${chaptersTocover} chapters over ${totalDays} days (approximately ${weeksAvailable} weeks) with ${selected_days.length} study sessions per week. This means you have approximately ${weeksAvailable * selected_days.length} total study sessions available. Plan accordingly to ensure ALL chapters are covered.`
      : '';

    const prompt = `You are an expert education planner. ${syllabusContext} Generate a detailed study plan for a student with the following requirements:${planningContext}

Subject: ${subjectName}
Grade Level: ${gradeName}
Study Duration per Session: ${study_duration_minutes} minutes
Selected Days of Week: ${selected_days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
Preferred Study Times: ${preferred_times.join(', ')}
Start Date: ${start_date}
End Date: ${end_date}

CRITICAL - AVOID SCHEDULING CONFLICTS:
The student already has the following events scheduled. YOU MUST NOT schedule any sessions that overlap with these existing events:
${busyTimeSlots}

IMPORTANT - Chapter Selection:
${chapterScope}

${isChapterSpecific ? 'Selected Chapters:' : 'All Chapters:'}
${chaptersInfo}

Please generate a JSON array of study events with the following structure:
[
  {
    "title": "${subjectName} - Session Title",
    "description": "Brief description of what to study",
    "date": "YYYY-MM-DD",
    "start_time": "HH:MM",
    "end_time": "HH:MM",
    "chapter_number": 1 or null,
    "topics": ["topic1", "topic2"]
  }
]

Requirements:
1. CRITICAL: DO NOT schedule any sessions that conflict with the existing events listed above. Check every date and time carefully to avoid overlaps.
2. ALL titles MUST start with "${subjectName} - " followed by the chapter reference and descriptive title. For chapter-specific sessions, include the chapter number in the format "Ch X" or "Ch X.Y" for subtopics (e.g., "${subjectName} - Ch 1: Introduction", "${subjectName} - Ch 1.1: Basic Concepts", "${subjectName} - Ch 2.3: Advanced Topics"). For review or practice sessions, use descriptive titles (e.g., "${subjectName} - Review Session", "${subjectName} - Practice Problems")
3. CRITICAL: Schedule sessions ONLY on these days of the week: ${selected_days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}. Do NOT schedule sessions on other days.
4. CRITICAL: Generate sessions for ALL occurrences of the selected days between ${start_date} and ${end_date}. For example, if the user selected Monday, Wednesday, and Friday, create sessions for EVERY Monday, Wednesday, and Friday within the date range. Do not skip weeks unless there are conflicts. Create a comprehensive study schedule that uses all available days.
5. Each session should be ${study_duration_minutes} minutes long
6. Schedule sessions during ${preferred_times.join(' or ')} time slots
7. ${isChapterSpecific ? 'Cover ONLY the selected chapters listed above systematically' : `CRITICAL: Cover ALL ${chapters.length} chapters listed above. Create study sessions for EVERY chapter from Chapter 1 to the last chapter. Distribute these chapters across ALL available study days between ${start_date} and ${end_date}. Do not skip any chapters.`}
8. Include review sessions every few weeks
9. Start with easier topics and progress to harder ones
10. Add milestone checkpoints for assessments
11. CRITICAL: ALL dates MUST be between ${start_date} and ${end_date} inclusive. Do not schedule anything before ${start_date} or after ${end_date}. The first session should start on or shortly after ${start_date}.
12. For morning slots use 8:00-12:00, afternoon 13:00-17:00, evening 18:00-22:00
13. If a time slot is taken on a specific date, choose a different time on the same day, or skip to the next occurrence of that day of the week
14. IMPORTANT: When the syllabus PDF is attached, read it carefully and use it as the primary reference for planning topics and chapters. ${isChapterSpecific ? 'Focus ONLY on the chapters listed above from the PDF.' : `Read the ENTIRE PDF syllabus and extract ALL chapters and topics. Create study sessions covering the complete syllabus from beginning to end. Use the PDF content to understand the full scope and depth of each chapter.`}
${isChapterSpecific ? '15. Do NOT include any chapters that are not in the list above' : '15. CRITICAL: Ensure that by the end date, ALL chapters from the syllabus have been covered at least once. Plan the distribution of chapters to fit within the available time between start and end dates.'}

Return ONLY the JSON array, no additional text.`;

    console.log("🤖 Calling AI API...");
    console.log("📏 Prompt length:", prompt.length, "characters");

    // Gemini natively supports PDFs with application/pdf mime type
    // Claude and OpenAI only support images, so we use extracted chapter text for those
    let pdfToInclude: string[] = [];
    if (syllabusPdfBase64 && aiModel.provider === 'gemini') {
      console.log("📄 Including syllabus PDF (Gemini has native PDF support)");
      pdfToInclude = [syllabusPdfBase64];
    } else if (syllabusPdfBase64) {
      console.log(`⚠️ PDF available but ${aiModel.provider} doesn't support PDFs natively, using extracted chapter text`);
    }

    // For providers that don't support PDFs, enhance the prompt with chapter details
    let enhancedPrompt = prompt;
    if (!pdfToInclude.length && syllabusPdfBase64) {
      enhancedPrompt = `${prompt}\n\nNote: The detailed syllabus structure and chapters are listed above. Use this information to plan the study schedule.`;
    }

    // Call AI provider abstraction
    const aiResponse = await generateAIResponse({
      model: aiModel,
      messages: [{
        role: 'user',
        content: enhancedPrompt
      }],
      images: pdfToInclude,
      temperature: 0.7,
      maxTokens: 16000  // Increased to handle comprehensive study plans
    });

    console.log("✅ AI API response received");

    const promptTokenCount = aiResponse.promptTokens;
    const candidatesTokenCount = aiResponse.completionTokens;
    const totalTokenCount = aiResponse.totalTokens;

    // Log token usage for monitoring
    console.log('=== Token Usage ===');
    console.log(`Model used: ${aiModel.model_name} (${aiModel.provider})`);
    console.log(`Input tokens: ${promptTokenCount}`);
    console.log(`Output tokens: ${candidatesTokenCount}`);
    console.log(`Total tokens: ${totalTokenCount}`);
    console.log(`PDF included: ${pdfToInclude.length > 0 ? 'Yes' : 'No'}`);
    console.log(`Chapters included: ${chapters.length}`);

    // Get model pricing from database for accurate cost calculation
    const { data: modelData, error: modelError } = await supabaseClient
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
      console.log(`Estimated cost: $${totalCost.toFixed(6)} (Input: $${inputCost.toFixed(6)}, Output: $${outputCost.toFixed(6)})`);
    }

    const generatedText = aiResponse.content;
    console.log("📄 Generated text length:", generatedText.length);
    console.log("📄 Generated text preview:", generatedText.substring(0, 500));

    // Extract JSON from the response
    let studyEvents: any[] = [];
    try {
      console.log("🔍 Attempting to extract JSON from response...");

      // Strip markdown code blocks if present (e.g., ```json\n[...]\n``` or ```\n[...]\n```)
      let cleanedText = generatedText
        .replace(/```json\s*\n?/g, '')
        .replace(/```javascript\s*\n?/g, '')
        .replace(/```\s*\n?/g, '')
        .trim();

      console.log("📄 Cleaned text preview:", cleanedText.substring(0, 500));

      // Try to find JSON array in the response
      const jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        console.log("✅ JSON pattern found, attempting to parse...");
        let jsonText = jsonMatch[0];

        // Check if JSON is complete by counting brackets
        const openBrackets = (jsonText.match(/\[/g) || []).length;
        const closeBrackets = (jsonText.match(/\]/g) || []).length;
        const openBraces = (jsonText.match(/\{/g) || []).length;
        const closeBraces = (jsonText.match(/\}/g) || []).length;

        console.log(`📊 Bracket counts: [ ${openBrackets}/${closeBrackets} ] { ${openBraces}/${closeBraces} }`);

        // If JSON is incomplete (truncated), try to fix it
        let wasTruncated = false;
        if (openBraces > closeBraces || openBrackets > closeBrackets) {
          console.warn("⚠️ Detected incomplete JSON (likely truncated by token limit), attempting to fix...");
          wasTruncated = true;

          // Remove any incomplete last object (everything after the last complete object)
          const lastCompleteObject = jsonText.lastIndexOf('},');
          if (lastCompleteObject > 0) {
            jsonText = jsonText.substring(0, lastCompleteObject + 1); // Keep the comma after }
          }

          // Close the array
          jsonText = jsonText.trim();
          if (!jsonText.endsWith(']')) {
            jsonText += '\n]';
          }

          console.log("🔧 Fixed JSON by removing incomplete trailing object");
        }

        // Additional cleanup for common AI formatting issues
        // Remove trailing commas before closing brackets/braces
        jsonText = jsonText.replace(/,(\s*[\]}])/g, '$1');

        try {
          studyEvents = JSON.parse(jsonText);
          console.log(`✅ Parsed ${studyEvents.length} study events successfully`);
          if (wasTruncated) {
            console.warn(`⚠️ Note: JSON was truncated. Recovered ${studyEvents.length} complete events, but some events may have been lost.`);
          }
        } catch (parseError) {
          console.error("❌ Initial parse failed, trying with more aggressive cleanup...");

          // Try more aggressive cleanup
          // Remove comments (both // and /* */)
          jsonText = jsonText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

          // Try parsing again
          studyEvents = JSON.parse(jsonText);
          console.log(`✅ Parsed ${studyEvents.length} study events after cleanup`);
          if (wasTruncated) {
            console.warn(`⚠️ Note: JSON was truncated. Recovered ${studyEvents.length} complete events, but some events may have been lost.`);
          }
        }

        // Validate event count
        if (studyEvents.length === 0) {
          throw new Error('AI generated 0 events. Please try again with different parameters.');
        }

        if (studyEvents.length > 500) {
          console.warn(`⚠️ AI generated ${studyEvents.length} events, limiting to 500`);
          studyEvents = studyEvents.slice(0, 500);
        }

        console.log("📋 First event:", JSON.stringify(studyEvents[0], null, 2));
      } else {
        console.error("❌ No valid JSON array found in response");
        throw new Error('No valid JSON found in response');
      }
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError);
      console.error('Error details:', parseError instanceof Error ? parseError.message : String(parseError));
      console.error('Generated text (first 1000 chars):', generatedText.substring(0, 1000));
      console.error('Generated text (last 1000 chars):', generatedText.substring(Math.max(0, generatedText.length - 1000)));
      throw new Error(`Failed to parse AI-generated study plan: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }

    // Create a map of chapter titles to IDs
    console.log("🗺️ Creating chapter mapping...");
    const chapterMap = new Map(
      chapters?.map(ch => [ch.chapter_number, ch.id]) || []
    );
    console.log(`✅ Chapter map created with ${chapterMap.size} entries`);

    // Re-verify schedule exists before inserting events (defensive check)
    console.log("🔍 Re-verifying schedule before inserting events...");
    const { data: scheduleRecheck, error: scheduleRecheckError } = await supabaseClient
      .from('study_plan_schedules')
      .select('id, user_id')
      .eq('id', schedule_id)
      .single();

    if (scheduleRecheckError || !scheduleRecheck) {
      console.error("❌ Schedule no longer exists:", schedule_id);
      console.error("Recheck error:", scheduleRecheckError);
      throw new Error(`Schedule ${schedule_id} was deleted or is no longer accessible. Please try creating the study plan again.`);
    }
    console.log("✅ Schedule still exists, proceeding with event insertion");

    // Insert events into database
    console.log("💾 Preparing events for database insertion...");
    console.log("💾 Using schedule_id:", schedule_id);
    console.log("💾 Using user_id:", user_id);

    const eventsToInsert = studyEvents.map(event => ({
      schedule_id,
      user_id,
      title: event.title,
      description: event.description || null,
      event_date: event.date,
      start_time: event.start_time,
      end_time: event.end_time,
      chapter_id: event.chapter_number ? chapterMap.get(event.chapter_number) : null,
      topics: event.topics || [],
      status: 'pending'
    }));

    console.log(`📝 Prepared ${eventsToInsert.length} events for insertion`);
    console.log("📋 First event to insert:", JSON.stringify(eventsToInsert[0], null, 2));

    // Insert events in batches to avoid connection timeouts
    console.log("💾 Inserting events into database in batches...");
    const BATCH_SIZE = 25; // Reduced batch size for better reliability
    const batches = [];

    for (let i = 0; i < eventsToInsert.length; i += BATCH_SIZE) {
      batches.push(eventsToInsert.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 Split into ${batches.length} batches of max ${BATCH_SIZE} events each`);

    let insertedEvents: any[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`💾 Inserting batch ${i + 1}/${batches.length} (${batch.length} events)...`);

      // Retry logic for failed batches
      let retryCount = 0;
      const MAX_RETRIES = 3;
      let success = false;

      while (!success && retryCount < MAX_RETRIES) {
        try {
          const { data: batchData, error: batchError } = await supabaseClient
            .from('study_plan_events')
            .insert(batch)
            .select();

          if (batchError) {
            throw batchError;
          }

          insertedEvents = insertedEvents.concat(batchData || []);
          console.log(`✅ Batch ${i + 1}/${batches.length} inserted successfully (${batchData?.length || 0} events)`);
          success = true;

          // Longer delay between batches to avoid connection issues
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error) {
          retryCount++;
          if (retryCount < MAX_RETRIES) {
            console.log(`⚠️ Batch ${i + 1} failed, retrying (${retryCount}/${MAX_RETRIES})...`);
            // Exponential backoff: wait longer after each failure
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          } else {
            console.error(`❌ Failed to insert batch ${i + 1} after ${MAX_RETRIES} retries:`, error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            throw error;
          }
        }
      }
    }

    console.log(`✅ Successfully inserted ${insertedEvents.length} events`);
    console.log("📊 Inserted events summary:");
    insertedEvents.forEach((event, idx) => {
      console.log(`   ${idx + 1}. ${event.title} - ${event.event_date}`);
    });

    // Save token usage to database for cost tracking and analytics
    console.log("💾 Logging token usage to database...");

    // Get model ID for logging
    const { data: aiModelData } = await supabaseClient
      .from('ai_models')
      .select('id')
      .eq('model_name', aiModel.model_name)
      .single();

    try {
      await supabaseClient.from('token_usage_logs').insert({
        user_id: user_id,
        model: aiModel.model_name,
        provider: aiModel.provider,
        prompt_tokens: promptTokenCount,
        completion_tokens: candidatesTokenCount,
        total_tokens: totalTokenCount,
        estimated_cost: totalCost,
        purpose: 'study_plan_generation',
        ai_model_id: aiModelData?.id || null,
        metadata: {
          schedule_id: schedule_id,
          subject_id: subject_id,
          grade_id: grade_id,
          events_generated: insertedEvents.length,
          chapters_included: chapters.length,
          had_pdf: !!syllabusPdfBase64,
          date_range: `${start_date} to ${end_date}`
        }
      });
      console.log('✅ Token usage logged to database');

      // Update user subscription token usage with cost-based adjustment
      console.log("📊 Updating user subscription token usage with cost-based adjustment...");

      // Calculate cost-adjusted token consumption using the database function
      // This ensures that more expensive models consume proportionally more from the user's allocation
      const { data: adjustedTokenData, error: calcError } = await supabaseClient
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
        console.error('❌ Failed to calculate cost-based tokens, using actual token count:', calcError);
      }

      const { data: currentSub, error: fetchError } = await supabaseClient
        .from('user_subscriptions')
        .select('tokens_used_current_period')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .single();

      if (fetchError) {
        console.error('❌ Failed to fetch current subscription:', fetchError);
      } else if (currentSub) {
        const newTokenCount = currentSub.tokens_used_current_period + tokensToDeduct;

        const { error: updateError } = await supabaseClient
          .from('user_subscriptions')
          .update({
            tokens_used_current_period: newTokenCount
          })
          .eq('user_id', user_id)
          .eq('status', 'active');

        if (updateError) {
          console.error('❌ Failed to update subscription token usage:', updateError);
        } else {
          console.log(`✅ Updated subscription token usage: ${currentSub.tokens_used_current_period} -> ${newTokenCount} (+${tokensToDeduct} Gemini-equivalent tokens, ${totalTokenCount} actual tokens, cost $${totalCost.toFixed(6)})`);
        }
      }
    } catch (logError) {
      console.error('❌ Failed to log token usage:', logError);
      // Don't fail the request if logging fails
    }

    console.log("🎉 Study plan generation completed successfully!");
    console.log("⏰ Completion time:", new Date().toISOString());

    return new Response(
      JSON.stringify({
        success: true,
        events_created: insertedEvents.length,
        message: `Successfully generated ${insertedEvents.length} study sessions`,
        tokenUsage: {
          promptTokens: promptTokenCount,
          completionTokens: candidatesTokenCount,
          totalTokens: totalTokenCount,
          estimatedCost: totalCost
        }
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error('❌ ERROR OCCURRED:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('⏰ Error time:', new Date().toISOString());

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An error occurred while generating the study plan',
        error_details: {
          name: error.name,
          message: error.message,
          timestamp: new Date().toISOString()
        }
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
