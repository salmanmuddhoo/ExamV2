import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    console.log("  - Chapter IDs:", chapter_ids || "All chapters");
    console.log("  - Duration:", study_duration_minutes, "minutes");
    console.log("  - Selected days:", selected_days.join(', '));
    console.log("  - Preferred times:", preferred_times);
    console.log("  - Date range:", start_date, "to", end_date);

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
    const { data: syllabusData, error: syllabusError } = await supabaseClient
      .from('syllabus')
      .select('id, file_url')
      .eq('subject_id', subject_id)
      .eq('grade_id', grade_id)
      .single();

    if (syllabusError) {
      console.warn("⚠️ No syllabus found for this subject/grade:", syllabusError.message);
      console.log("📝 Will generate study plan without specific chapters");
    } else {
      console.log("✅ Syllabus found:", syllabusData.id);
      console.log("📄 Syllabus PDF URL:", syllabusData.file_url);
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

            // Convert to base64
            const base64 = btoa(String.fromCharCode(...pdfBytes));
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

    // Get Gemini API key
    console.log("🔑 Checking for Gemini API key...");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      console.error("❌ Gemini API key not configured");
      throw new Error("Gemini API key not configured");
    }
    console.log("✅ Gemini API key found (length:", geminiApiKey.length, ")");

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
      : 'Cover all available chapters systematically from the syllabus.';

    console.log("📝 Preparing AI prompt...");
    console.log("📚 Chapters info length:", chaptersInfo.length);
    console.log("🎯 Chapter scope:", chapterScope);
    console.log("📄 Has PDF:", syllabusPdfBase64 ? 'Yes' : 'No');

    const prompt = `You are an expert education planner. I have attached the complete syllabus document for reference. Generate a detailed study plan for a student with the following requirements:

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
2. ALL titles MUST start with "${subjectName} - " followed by a descriptive session title (e.g., "${subjectName} - Chapter 1: Introduction", "${subjectName} - Review Session", "${subjectName} - Practice Problems")
3. CRITICAL: Schedule sessions ONLY on these days of the week: ${selected_days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}. Do NOT schedule sessions on other days.
4. Each session should be ${study_duration_minutes} minutes long
5. Schedule sessions during ${preferred_times.join(' or ')} time slots
6. ${isChapterSpecific ? 'Cover ONLY the selected chapters listed above systematically' : 'Cover all chapters systematically from start to finish'}
7. Include review sessions every few weeks
8. Start with easier topics and progress to harder ones
9. Add milestone checkpoints for assessments
10. CRITICAL: ALL dates MUST be between ${start_date} and ${end_date} inclusive. Do not schedule anything before ${start_date} or after ${end_date}. The first session should start on or shortly after ${start_date}.
11. Distribute sessions evenly across the selected days (${selected_days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')})
12. For morning slots use 8:00-12:00, afternoon 13:00-17:00, evening 18:00-22:00
13. If a time slot is taken on a specific date, choose a different time on the same day, or skip to the next occurrence of that day of the week
${isChapterSpecific ? '14. Do NOT include any chapters that are not in the list above' : ''}

Return ONLY the JSON array, no additional text.`;

    console.log("🤖 Calling Gemini API...");
    console.log("📏 Prompt length:", prompt.length, "characters");

    // Prepare parts for Gemini API
    const parts: any[] = [];

    // Add PDF first if available
    if (syllabusPdfBase64) {
      console.log("📄 Adding syllabus PDF to request");
      parts.push({
        inline_data: {
          mime_type: "application/pdf",
          data: syllabusPdfBase64
        }
      });
    }

    // Add text prompt
    parts.push({
      text: prompt
    });

    // Call Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: parts
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8000,
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('❌ Gemini API error:', errorText);
      console.error('Status:', geminiResponse.status);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    console.log("✅ Gemini API response received");
    const geminiData = await geminiResponse.json();
    console.log("📦 Gemini response structure:", JSON.stringify(geminiData, null, 2));

    // Extract token usage from Gemini response
    const usageMetadata = geminiData?.usageMetadata || {};
    const promptTokenCount = usageMetadata.promptTokenCount || 0;
    const candidatesTokenCount = usageMetadata.candidatesTokenCount || 0;
    const totalTokenCount = usageMetadata.totalTokenCount || (promptTokenCount + candidatesTokenCount);

    // Log token usage for monitoring
    console.log('=== Token Usage ===');
    console.log(`Model used: gemini-2.0-flash-exp`);
    console.log(`Input tokens: ${promptTokenCount}`);
    console.log(`Output tokens: ${candidatesTokenCount}`);
    console.log(`Total tokens: ${totalTokenCount}`);
    console.log(`PDF included: ${syllabusPdfBase64 ? 'Yes' : 'No'}`);
    console.log(`Chapters included: ${chapters.length}`);

    // Calculate estimated cost (Gemini 2.0 Flash pricing)
    // Input: $0.075 per 1M tokens, Output: $0.30 per 1M tokens
    const inputCost = (promptTokenCount / 1000000) * 0.075;
    const outputCost = (candidatesTokenCount / 1000000) * 0.30;
    const totalCost = inputCost + outputCost;

    console.log(`Estimated cost: $${totalCost.toFixed(6)} (Input: $${inputCost.toFixed(6)}, Output: $${outputCost.toFixed(6)})`);

    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log("📄 Generated text length:", generatedText.length);
    console.log("📄 Generated text preview:", generatedText.substring(0, 500));

    // Extract JSON from the response
    let studyEvents: any[] = [];
    try {
      console.log("🔍 Attempting to extract JSON from response...");
      // Try to find JSON in the response
      const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        console.log("✅ JSON pattern found");
        studyEvents = JSON.parse(jsonMatch[0]);
        console.log(`✅ Parsed ${studyEvents.length} study events`);

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
      console.error('❌ Failed to parse Gemini response:', parseError);
      console.error('Generated text:', generatedText);
      throw new Error('Failed to parse AI-generated study plan');
    }

    // Create a map of chapter titles to IDs
    console.log("🗺️ Creating chapter mapping...");
    const chapterMap = new Map(
      chapters?.map(ch => [ch.chapter_number, ch.id]) || []
    );
    console.log(`✅ Chapter map created with ${chapterMap.size} entries`);

    // Insert events into database
    console.log("💾 Preparing events for database insertion...");
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
    try {
      await supabaseClient.from('token_usage_logs').insert({
        user_id: user_id,
        model: 'gemini-2.0-flash-exp',
        provider: 'gemini',
        prompt_tokens: promptTokenCount,
        completion_tokens: candidatesTokenCount,
        total_tokens: totalTokenCount,
        estimated_cost: totalCost,
        purpose: 'study_plan_generation',
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

      // Update user subscription token usage
      console.log("📊 Updating user subscription token usage...");
      const { data: currentSub, error: fetchError } = await supabaseClient
        .from('user_subscriptions')
        .select('tokens_used_current_period')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .single();

      if (fetchError) {
        console.error('❌ Failed to fetch current subscription:', fetchError);
      } else if (currentSub) {
        const newTokenCount = currentSub.tokens_used_current_period + totalTokenCount;

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
          console.log(`✅ Updated subscription token usage: ${currentSub.tokens_used_current_period} -> ${newTokenCount} (+${totalTokenCount} tokens)`);
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
