import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateAIResponse, getUserAIModel, getDefaultAIModel, type AIModelConfig } from "./ai-providers.ts";
import { generateStudyPlanWithAgent, shouldUseAgentMode, isAgentModeEnabled } from "./agent-integration.ts";

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
  use_agent_mode?: boolean; // Optional: use AI agent with function calling for calendar-aware scheduling
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
      .select(`
        event_date,
        start_time,
        end_time,
        title,
        study_plan_schedules!inner(subject_id, grade_id)
      `)
      .eq('user_id', user_id)
      .gte('event_date', start_date)
      .lte('event_date', end_date);

    if (eventsError) {
      console.error("❌ Error fetching existing events:", eventsError);
    } else {
      console.log(`✅ Found ${existingEvents?.length || 0} existing events in date range`);
    }

    // Format busy time slots for AI
    // Filter out events from the SAME subject and grade (can only have 1 active session per subject/grade)
    let busyTimeSlots = '';
    let conflictingSessions: any[] = [];

    if (existingEvents && existingEvents.length > 0) {
      console.log(`🔍 Checking for subject/grade conflicts...`);
      console.log(`   Current session: Subject ${subject_id}, Grade ${grade_id}`);

      existingEvents.forEach(event => {
        const eventSubjectId = event.study_plan_schedules?.subject_id;
        const eventGradeId = event.study_plan_schedules?.grade_id;

        // If there's already a session for the same subject AND grade at this time, it's a conflict
        if (eventSubjectId === subject_id && eventGradeId === grade_id) {
          conflictingSessions.push(event);
        }
      });

      // Only log first 5 conflicts to avoid flooding logs
      if (conflictingSessions.length > 0) {
        console.log(`   ⚠️ Found ${conflictingSessions.length} conflicting session(s) for same subject/grade`);
        if (conflictingSessions.length <= 5) {
          conflictingSessions.forEach(event => {
            console.log(`      - ${event.event_date} ${event.start_time} - ${event.title}`);
          });
        } else {
          conflictingSessions.slice(0, 5).forEach(event => {
            console.log(`      - ${event.event_date} ${event.start_time} - ${event.title}`);
          });
          console.log(`      ... and ${conflictingSessions.length - 5} more conflicts`);
        }
      }

      // Only include NON-conflicting sessions in busy slots for AI
      // Conflicting sessions will be replaced with the new schedule
      const nonConflictingEvents = existingEvents.filter(event => {
        const eventSubjectId = event.study_plan_schedules?.subject_id;
        const eventGradeId = event.study_plan_schedules?.grade_id;
        return !(eventSubjectId === subject_id && eventGradeId === grade_id);
      });

      if (nonConflictingEvents.length > 0) {
        busyTimeSlots = nonConflictingEvents.map(event =>
          `${event.event_date} from ${event.start_time} to ${event.end_time} (${event.title})`
        ).join('\n');
        console.log(`📅 Busy time slots (excluding ${conflictingSessions.length} conflicting sessions):`);
        console.log(busyTimeSlots);
      } else {
        busyTimeSlots = 'No conflicting events - calendar is clear for this subject/grade';
        console.log(`📅 No non-conflicting events found - calendar is clear`);
      }

      if (conflictingSessions.length > 0) {
        console.log(`✅ ${conflictingSessions.length} conflicting sessions will be replaced with new schedule`);
      }
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

    // Check if AI Agent mode should be used
    const explicitAgentMode = isAgentModeEnabled(requestData);
    const autoAgentMode = shouldUseAgentMode(existingEvents?.length || 0, 50);
    const useAgentMode = explicitAgentMode || autoAgentMode;

    if (useAgentMode) {
      console.log("\n" + "=".repeat(80));
      console.log("🤖 AI AGENT MODE ENABLED");
      console.log("=".repeat(80));
      if (explicitAgentMode) {
        console.log("✅ Agent mode explicitly enabled via request parameter");
      }
      if (autoAgentMode) {
        console.log(`✅ Agent mode auto-enabled (${existingEvents?.length || 0} existing events >= 50 threshold)`);
      }
      console.log("📊 Using multi-step reasoning with incremental calendar checks");
      console.log("=".repeat(80) + "\n");

      let agentResult;
      let promptTokenCount = 0;
      let candidatesTokenCount = 0;
      let totalTokenCount = 0;
      let totalCost = 0;

      try {
        // Use agent-based generation
        agentResult = await generateStudyPlanWithAgent(
          supabaseClient,
          user_id,
          subject_id,
          grade_id,
          subjectName,
          gradeName,
          start_date,
          end_date,
          selected_days,
          preferred_times,
          study_duration_minutes,
          chapters,
          aiModel
        );

        console.log("\n" + "=".repeat(80));
        console.log("✅ AGENT GENERATION COMPLETED");
        console.log("=".repeat(80));
        console.log(`📝 Sessions generated: ${agentResult.events.length}`);
        console.log(`💬 Reasoning steps: ${agentResult.reasoning.length}`);
        console.log(`🪙 Token usage: ${agentResult.token_usage.input} input + ${agentResult.token_usage.output} output`);
        console.log(`💰 Cost: $${agentResult.cost_usd.toFixed(6)}`);
        console.log("=".repeat(80) + "\n");

        // Extract token usage for deduction (will happen in finally block)
        promptTokenCount = agentResult.token_usage.input;
        candidatesTokenCount = agentResult.token_usage.output;
        totalTokenCount = promptTokenCount + candidatesTokenCount;
        totalCost = agentResult.cost_usd;

        // Convert agent events to the format expected by the rest of the function
        const studyEvents = agentResult.events;
        console.log("📊 Agent generated events:", JSON.stringify(studyEvents, null, 2));

        // Parse and validate events (same as legacy code)
        if (!studyEvents || !Array.isArray(studyEvents)) {
          throw new Error('AI agent did not return a valid array of study events');
        }

        console.log(`✅ Agent generated ${studyEvents.length} study events`);

        // Validate event count
        if (studyEvents.length === 0) {
          throw new Error('AI agent generated 0 sessions. This may be due to calendar conflicts or date range constraints. Please adjust your parameters and try again.');
        }

        // Create chapter mapping (chapter_number -> chapter_id)
        console.log("🗺️ Creating chapter mapping for agent events...");
        const chapterMap = new Map(
          chapters?.map(ch => [ch.chapter_number, ch.id]) || []
        );
        console.log(`✅ Chapter map created with ${chapterMap.size} entries`);

        // Convert to database format and insert
        const eventsToInsert = studyEvents.map((event: any) => ({
          schedule_id: schedule_id,
          user_id: user_id,
          title: event.title,
          description: event.description || '',
          event_date: event.date,
          start_time: event.start_time,
          end_time: event.end_time,
          chapter_id: event.chapter_number ? chapterMap.get(event.chapter_number) : null,
          topics: event.topics || [],
          status: 'pending'
        }));

        // Insert events in batches
        const BATCH_SIZE = 50;
        const batches = [];
        for (let i = 0; i < eventsToInsert.length; i += BATCH_SIZE) {
          batches.push(eventsToInsert.slice(i, i + BATCH_SIZE));
        }

        console.log(`📦 Inserting ${eventsToInsert.length} events in ${batches.length} batches`);

        const insertedEvents: any[] = [];
        const MAX_RETRIES = 3;

        for (let i = 0; i < batches.length; i++) {
          let retryCount = 0;
          while (retryCount <= MAX_RETRIES) {
            try {
              const { data: batchData, error: batchError } = await supabaseClient
                .from('study_plan_events')
                .insert(batches[i])
                .select();

              if (batchError) throw batchError;

              insertedEvents.push(...(batchData || []));
              console.log(`✅ Batch ${i + 1}/${batches.length} inserted successfully (${batchData?.length || 0} events)`);
              break;
            } catch (error) {
              retryCount++;
              if (retryCount < MAX_RETRIES) {
                console.log(`⚠️ Batch ${i + 1} failed, retrying (${retryCount}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
              } else {
                console.error(`❌ Failed to insert batch ${i + 1} after ${MAX_RETRIES} retries:`, error);
                throw error;
              }
            }
          }
        }

        console.log(`✅ Successfully inserted ${insertedEvents.length} events`);

        // Return successful response
        return new Response(
          JSON.stringify({
            success: true,
            message: `Successfully generated ${insertedEvents.length} study sessions using AI agent`,
            schedule_id: schedule_id,
            events_count: insertedEvents.length,
            token_usage: {
              prompt_tokens: promptTokenCount,
              completion_tokens: candidatesTokenCount,
              total_tokens: totalTokenCount,
              cost_adjusted_tokens: 0  // Will be calculated in finally block
            },
            cost_usd: totalCost,
            agent_mode: true,
            reasoning_steps: agentResult?.reasoning.length || 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('❌ Agent mode error:', error);
        // Error will be rethrown after token deduction in finally block
        throw error;
      } finally {
        // CRITICAL: Deduct tokens even if generation or insertion failed
        if (totalCost > 0 || totalTokenCount > 0) {
          console.log("\n💾 Logging token usage to database (even on failure)...");

          try {
            const { data: aiModelData } = await supabaseClient
              .from('ai_models')
              .select('id')
              .eq('model_name', aiModel.model_name)
              .single();

            await supabaseClient.from('token_usage_logs').insert({
              user_id: user_id,
              model: aiModel.model_name,
              provider: aiModel.provider,
              prompt_tokens: promptTokenCount,
              completion_tokens: candidatesTokenCount,
              total_tokens: totalTokenCount,
              estimated_cost: totalCost,
              purpose: 'study_plan_generation_agent',
              ai_model_id: aiModelData?.id || null,
              metadata: {
                schedule_id: schedule_id,
                subject_id: subject_id,
                grade_id: grade_id,
                events_generated: agentResult?.events?.length || 0,
                chapters_included: chapters.length,
                agent_mode: true,
                reasoning_steps: agentResult?.reasoning?.length || 0,
                date_range: `${start_date} to ${end_date}`,
                generation_failed: !agentResult  // Track if generation failed
              }
            });

            console.log('✅ Token usage logged to database');

            // Update user subscription token usage
            const { data: adjustedTokenData } = await supabaseClient
              .rpc('calculate_cost_based_token_consumption', {
                p_actual_prompt_tokens: promptTokenCount,
                p_actual_completion_tokens: candidatesTokenCount,
                p_actual_cost: totalCost
              });

            const tokensToDeduct = adjustedTokenData || totalTokenCount;

            await supabaseClient
              .rpc('increment_user_token_usage', {
                p_user_id: user_id,
                p_tokens: tokensToDeduct
              });

            console.log(`✅ Deducted ${tokensToDeduct} tokens from user subscription`);
          } catch (tokenError) {
            console.error('❌ Failed to log/deduct tokens (but continuing):', tokenError);
            // Don't throw - we want the original error to propagate
          }
        } else {
          console.log('⏭️ No tokens to deduct (no AI calls were made)');
        }
      }
    }

    // LEGACY MODE: Continue with traditional single-prompt generation
    console.log("\n📋 Using legacy single-prompt generation mode\n");

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
      ? `ABSOLUTELY CRITICAL: Focus ONLY on the following ${chapters.length} selected chapters. You MUST create study sessions for EVERY SINGLE ONE of these ${chapters.length} chapters. Do NOT include any other chapters from the syllabus, and do NOT skip any of the selected chapters. Ensure that all ${chapters.length} chapters listed below are covered in the study plan.`
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

    // Generate list of ALL valid dates based on selected days
    console.log("📅 Generating list of valid dates based on selected days...");
    const dayNameToNumber: { [key: string]: number } = {
      'sunday': 0,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6
    };

    const selectedDayNumbers = selected_days.map(day => dayNameToNumber[day.toLowerCase()]);
    const validDates: string[] = [];

    // Parse dates in local timezone to avoid timezone issues
    const startParts = start_date.split('-');
    const endParts = end_date.split('-');
    const currentDate = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));
    const endDate = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]));

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      if (selectedDayNumbers.includes(dayOfWeek)) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        validDates.push(`${year}-${month}-${day}`);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`✅ Generated ${validDates.length} valid dates for selected days`);
    console.log(`📋 First 10 valid dates: ${validDates.slice(0, 10).join(', ')}`);

    // Calculate study planning metrics
    const startDateObj = new Date(start_date);
    const endDateObj = new Date(end_date);
    const totalDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
    const weeksAvailable = Math.floor(totalDays / 7);
    const chaptersTocover = isChapterSpecific ? chapters.length : chapters.length;

    // Calculate chapter distribution for sequential ordering
    let chapterDistribution = '';
    if (chapters.length > 0) {
      const totalSessions = validDates.length;
      const sessionsPerChapter = Math.floor(totalSessions / chapters.length);
      const remainingSessions = totalSessions % chapters.length;

      console.log(`📊 Chapter Distribution Calculation:`);
      console.log(`   Total sessions: ${totalSessions}`);
      console.log(`   Total chapters: ${chapters.length}`);
      console.log(`   Sessions per chapter: ${sessionsPerChapter}`);
      console.log(`   Remaining sessions: ${remainingSessions}`);

      // Build chapter date ranges for sequential ordering
      let sessionIndex = 0;
      const chapterSchedule = chapters.map((ch, idx) => {
        const sessionsForThisChapter = sessionsPerChapter + (idx < remainingSessions ? 1 : 0);
        const startDate = validDates[sessionIndex];
        const endDate = validDates[Math.min(sessionIndex + sessionsForThisChapter - 1, validDates.length - 1)];
        sessionIndex += sessionsForThisChapter;

        return `  Chapter ${ch.chapter_number}: ${ch.chapter_title}
    Sessions: ${sessionsForThisChapter}
    Date range: ${startDate} to ${endDate}`;
      }).join('\n\n');

      chapterDistribution = `\n\n🚨 SEQUENTIAL CHAPTER ORDERING - ABSOLUTELY CRITICAL 🚨

You MUST follow this EXACT chapter schedule. Complete each chapter BEFORE moving to the next:

${chapterSchedule}

RULES:
- Complete ALL sessions for Chapter 1 before starting Chapter 2
- Complete ALL sessions for Chapter 2 before starting Chapter 3
- And so on for all chapters in sequential order
- Do NOT jump between chapters
- Do NOT go back to previous chapters once you've moved to the next
- Each chapter should be covered in the date range specified above
- The date ranges ensure even distribution across the study period`;
    }

    const planningContext = !isChapterSpecific && chapters.length > 0
      ? `\n\nPLANNING CONTEXT: You need to cover ${chaptersTocover} chapters over ${totalDays} days (approximately ${weeksAvailable} weeks) with ${selected_days.length} study sessions per week. This means you have approximately ${weeksAvailable * selected_days.length} total study sessions available. Plan accordingly to ensure ALL chapters are covered.${chapterDistribution}`
      : chapterDistribution;

    // Create a readable list of valid dates for the AI
    const validDatesFormatted = validDates.length > 50
      ? `${validDates.slice(0, 50).join(', ')} ... and ${validDates.length - 50} more dates (total: ${validDates.length} dates)`
      : validDates.join(', ');

    const prompt = `You are an expert education planner. ${syllabusContext} Generate a detailed study plan for a student with the following requirements:${planningContext}

Subject: ${subjectName}
Grade Level: ${gradeName}
Study Duration per Session: ${study_duration_minutes} minutes
Selected Days of Week: ${selected_days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
Preferred Study Times: ${preferred_times.join(', ')}
Start Date: ${start_date}
End Date: ${end_date}

🚨 CRITICAL - VALID DATES ONLY 🚨
You MUST ONLY use dates from this exact list. These are the ONLY valid dates for scheduling sessions:
${validDatesFormatted}

IMPORTANT INSTRUCTIONS:
- DO NOT use any dates not in this list
- These dates represent ALL occurrences of the selected days (${selected_days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}) between ${start_date} and ${end_date}
- You MUST create a study session for EVERY SINGLE ONE of these ${validDates.length} dates
- Your output should have EXACTLY ${validDates.length} study sessions (one per valid date)
- Distribute the chapters/topics evenly across ALL ${validDates.length} dates
- EVERY date in the list should appear EXACTLY ONCE in your study plan
- Do NOT skip any dates unless there is a scheduling conflict

CRITICAL - AVOID SCHEDULING CONFLICTS:
The student already has the following events scheduled. YOU MUST NOT schedule any sessions that overlap with these existing events. If a date/time has a conflict, choose a different time slot on the same date:
${busyTimeSlots}

NOTE: If an existing event is for a DIFFERENT subject or grade, you MUST avoid that time slot. Only schedule in available time slots.

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
3. 🚨 ABSOLUTELY CRITICAL - USE ONLY THE VALID DATES LISTED ABOVE 🚨: You MUST pick dates ONLY from the list of ${validDates.length} valid dates provided above. Do NOT generate any dates that are not in that exact list. Every single "date" field in your JSON output must be one of the dates from the valid dates list. This is NON-NEGOTIABLE.
4. ⚠️ ABSOLUTELY CRITICAL - USE ALL ${validDates.length} DATES ⚠️: You MUST create EXACTLY ${validDates.length} study sessions - ONE session for EACH valid date. Do NOT skip any dates. Your JSON array should contain exactly ${validDates.length} objects. Each valid date should appear EXACTLY ONCE in your study plan. If you skip dates, you will fail this task.
5. 🚨 ABSOLUTELY CRITICAL - SEQUENTIAL CHAPTER ORDER 🚨: Follow the chapter schedule provided above EXACTLY. Complete ALL sessions for Chapter 1 BEFORE starting Chapter 2. Complete ALL sessions for Chapter 2 BEFORE starting Chapter 3. Do NOT jump between chapters. Do NOT revisit previous chapters. The FIRST event in your JSON array MUST be for Chapter 1, and you must stay on Chapter 1 until you've used up all the sessions allocated to it in the schedule above. This sequential ordering is MANDATORY.
6. Each session should be ${study_duration_minutes} minutes long
7. Schedule sessions during ${preferred_times.join(' or ')} time slots
8. ${isChapterSpecific ? `ABSOLUTELY CRITICAL - CHAPTER COVERAGE: You MUST create study sessions for ALL ${chapters.length} selected chapters listed above. Cover EVERY SINGLE chapter systematically in sequential order as specified. Do NOT skip any of the ${chapters.length} selected chapters. Do NOT include any chapters not in the list above.` : `CRITICAL: Cover ALL ${chapters.length} chapters listed above in sequential order. Create study sessions for EVERY chapter from Chapter 1 to the last chapter following the chapter schedule provided above. Do not skip any chapters.`}
9. For morning slots use 8:00-12:00, afternoon 13:00-17:00, evening 18:00-22:00
10. If a time slot is taken on a specific date, choose a different time on the same day, or skip to the next valid date
11. IMPORTANT: When the syllabus PDF is attached, read it carefully and use it as the primary reference for planning topics and chapters. ${isChapterSpecific ? 'Focus ONLY on the chapters listed above from the PDF.' : `Read the ENTIRE PDF syllabus and extract ALL chapters and topics. Create study sessions covering the complete syllabus from beginning to end in sequential order. Use the PDF content to understand the full scope and depth of each chapter.`}
${isChapterSpecific ? '12. Do NOT include any chapters that are not in the list above' : '12. CRITICAL: Ensure that by the end date, ALL chapters from the syllabus have been covered at least once following the sequential chapter schedule provided above.'}

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
      maxTokens: 32000  // Increased to prevent truncation for large study plans
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

        // Check if AI generated the expected number of events
        console.log(`\n📊 AI EVENT GENERATION CHECK:`);
        console.log(`   Expected: ${validDates.length} events (one per valid date)`);
        console.log(`   Generated: ${studyEvents.length} events`);
        if (studyEvents.length < validDates.length) {
          const missing = validDates.length - studyEvents.length;
          console.warn(`   ⚠️ WARNING: AI generated ${missing} fewer events than expected!`);
          console.warn(`   This means ${missing} dates will NOT have study sessions.`);
        } else if (studyEvents.length > validDates.length) {
          const extra = studyEvents.length - validDates.length;
          console.warn(`   ⚠️ WARNING: AI generated ${extra} extra events!`);
          console.warn(`   Some dates may have duplicate sessions (will be filtered).`);
        } else {
          console.log(`   ✅ Perfect! AI generated exactly the right number of events.`);
        }

        // Check if AI followed sequential chapter ordering
        if (chapters.length > 0 && studyEvents.length > 0) {
          console.log(`\n📚 SEQUENTIAL CHAPTER ORDER CHECK:`);
          let currentChapter = 0;
          let chapterJumps = 0;
          let backwardJumps = 0;

          studyEvents.forEach((event, idx) => {
            const eventChapter = event.chapter_number;
            if (eventChapter) {
              if (eventChapter < currentChapter) {
                backwardJumps++;
                console.warn(`   ⚠️ Event ${idx + 1}: Backward jump from Ch ${currentChapter} to Ch ${eventChapter} - "${event.title}"`);
              } else if (eventChapter > currentChapter + 1) {
                chapterJumps++;
                console.warn(`   ⚠️ Event ${idx + 1}: Skipped chapter(s) from Ch ${currentChapter} to Ch ${eventChapter} - "${event.title}"`);
              }
              currentChapter = Math.max(currentChapter, eventChapter);
            }
          });

          if (backwardJumps === 0 && chapterJumps === 0) {
            console.log(`   ✅ Perfect! All chapters follow sequential order.`);
          } else {
            console.warn(`   ⚠️ Chapter ordering issues detected:`);
            console.warn(`      - Backward jumps: ${backwardJumps}`);
            console.warn(`      - Skipped chapters: ${chapterJumps}`);
          }

          // Show first 10 events and their chapters
          console.log(`\n   First 10 events by chapter:`);
          studyEvents.slice(0, 10).forEach((event, idx) => {
            console.log(`      ${idx + 1}. Ch ${event.chapter_number || 'N/A'}: ${event.title.substring(0, 60)}`);
          });
        }

        console.log("\n📋 First event:", JSON.stringify(studyEvents[0], null, 2));
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

    // Validate and filter events for correct dates and days
    console.log("🔍 Validating generated events...");
    console.log(`📊 AI GENERATED ${studyEvents.length} TOTAL EVENTS`);

    // Helper function to check if a date is valid
    const isValidDate = (dateStr: string): boolean => {
      const date = new Date(dateStr);
      // Check if date is valid and matches the input string
      // This catches invalid dates like Feb 29 on non-leap years
      if (isNaN(date.getTime())) return false;

      // Format back to YYYY-MM-DD and compare to catch invalid dates
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const formatted = `${year}-${month}-${day}`;

      return formatted === dateStr;
    };

    // Helper function to get day of week from date string (parse in local timezone)
    const getDayOfWeek = (dateStr: string): string => {
      // Parse as local date to avoid timezone issues
      // "2026-05-19" should be parsed as local May 19, 2026
      const parts = dateStr.split('-');
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
      const day = parseInt(parts[2]);
      const date = new Date(year, month, day);

      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      return days[date.getDay()];
    };

    // Track filtering reasons
    let invalidDateCount = 0;
    let wrongDayCount = 0;
    const wrongDaysByDay: { [key: string]: number } = {};

    // Filter events: keep only those with valid dates on selected days
    const initialEventCount = studyEvents.length;
    studyEvents = studyEvents.filter(event => {
      // Check if date is valid
      if (!isValidDate(event.date)) {
        invalidDateCount++;
        console.warn(`⚠️ FILTERED (Invalid Date): ${event.date} - ${event.title}`);
        return false;
      }

      // Check if date is on a selected day
      const dayOfWeek = getDayOfWeek(event.date);
      if (!selected_days.includes(dayOfWeek)) {
        wrongDayCount++;
        wrongDaysByDay[dayOfWeek] = (wrongDaysByDay[dayOfWeek] || 0) + 1;
        console.warn(`⚠️ FILTERED (Wrong Day - ${dayOfWeek}): ${event.date} - ${event.title}`);
        return false;
      }

      return true;
    });

    // Log detailed filtering summary
    console.log("\n" + "=".repeat(80));
    console.log("📊 FILTERING SUMMARY");
    console.log("=".repeat(80));
    console.log(`🤖 AI Generated:           ${initialEventCount} events`);
    console.log(`❌ Invalid Dates:          ${invalidDateCount} events filtered`);
    console.log(`❌ Wrong Day of Week:      ${wrongDayCount} events filtered`);
    if (wrongDayCount > 0) {
      console.log(`   Breakdown by day:`);
      Object.entries(wrongDaysByDay).forEach(([day, count]) => {
        console.log(`     - ${day}: ${count} events`);
      });
      console.log(`   Selected days were: ${selected_days.join(', ')}`);
    }
    console.log(`✅ Valid Events Remaining: ${studyEvents.length} events`);
    console.log(`📉 Total Filtered:         ${initialEventCount - studyEvents.length} events (${((initialEventCount - studyEvents.length) / initialEventCount * 100).toFixed(1)}%)`);
    console.log("=".repeat(80) + "\n");

    if (studyEvents.length === 0) {
      throw new Error('All generated events were invalid. Please try again.');
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

    // Log detailed insertion summary
    console.log("\n" + "=".repeat(80));
    console.log("💾 DATABASE INSERTION SUMMARY");
    console.log("=".repeat(80));
    console.log(`📝 Events Prepared for Insert: ${eventsToInsert.length}`);
    console.log(`📦 Number of Batches:          ${batches.length} (batch size: ${BATCH_SIZE})`);
    console.log(`✅ Events Successfully Inserted: ${insertedEvents.length}`);
    console.log(`❌ Events Lost During Insert:  ${eventsToInsert.length - insertedEvents.length}`);
    if (eventsToInsert.length !== insertedEvents.length) {
      console.error(`🚨 WARNING: ${eventsToInsert.length - insertedEvents.length} events were prepared but NOT inserted!`);
    }
    console.log("=".repeat(80) + "\n");

    console.log("📊 First 10 inserted events:");
    insertedEvents.slice(0, 10).forEach((event, idx) => {
      console.log(`   ${idx + 1}. ${event.title} - ${event.event_date}`);
    });
    if (insertedEvents.length > 10) {
      console.log(`   ... and ${insertedEvents.length - 10} more events`);
    }

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

    // Final comprehensive summary
    console.log("\n" + "=".repeat(80));
    console.log("🎯 FINAL STUDY PLAN GENERATION SUMMARY");
    console.log("=".repeat(80));
    console.log(`📅 Date Range:                 ${start_date} to ${end_date}`);
    console.log(`📚 Subject:                    ${subjectName} (${gradeName})`);
    console.log(`👤 User ID:                    ${user_id}`);
    console.log(`📋 Schedule ID:                ${schedule_id}`);
    console.log("");
    console.log("EVENT PIPELINE:");
    console.log(`  1️⃣ AI Generated:             ${initialEventCount} events`);
    console.log(`  2️⃣ After Filtering:          ${studyEvents.length} events (-${initialEventCount - studyEvents.length})`);
    console.log(`     ├─ Invalid Dates:         ${invalidDateCount} filtered`);
    console.log(`     └─ Wrong Day of Week:     ${wrongDayCount} filtered`);
    console.log(`  3️⃣ Prepared for Insert:      ${eventsToInsert.length} events`);
    console.log(`  4️⃣ Successfully Inserted:    ${insertedEvents.length} events`);
    console.log("");
    if (initialEventCount !== insertedEvents.length) {
      const totalLost = initialEventCount - insertedEvents.length;
      const lostToFiltering = initialEventCount - studyEvents.length;
      const lostToInsertion = eventsToInsert.length - insertedEvents.length;
      console.log(`📉 EVENTS LOST: ${totalLost} total (${((totalLost / initialEventCount) * 100).toFixed(1)}%)`);
      console.log(`   ├─ Lost to Filtering:      ${lostToFiltering} events`);
      console.log(`   └─ Lost to Insertion:      ${lostToInsertion} events`);
      if (lostToInsertion > 0) {
        console.error(`   🚨 ERROR: ${lostToInsertion} events failed to insert!`);
      }
    } else {
      console.log(`✅ SUCCESS: All events created successfully!`);
    }
    console.log("=".repeat(80) + "\n");

    return new Response(
      JSON.stringify({
        success: true,
        events_created: insertedEvents.length,
        message: `Successfully generated ${insertedEvents.length} study sessions`,
        debug_info: {
          ai_generated: initialEventCount,
          filtered_out: initialEventCount - studyEvents.length,
          invalid_dates: invalidDateCount,
          wrong_days: wrongDayCount,
          prepared_for_insert: eventsToInsert.length,
          successfully_inserted: insertedEvents.length
        },
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
