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
  study_duration_minutes: number;
  sessions_per_week: number;
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
      study_duration_minutes,
      sessions_per_week,
      preferred_times,
      start_date,
      end_date
    } = requestData;

    console.log("📝 Parsed parameters:");
    console.log("  - Schedule ID:", schedule_id);
    console.log("  - User ID:", user_id);
    console.log("  - Subject ID:", subject_id);
    console.log("  - Grade ID:", grade_id);
    console.log("  - Duration:", study_duration_minutes, "minutes");
    console.log("  - Sessions/week:", sessions_per_week);
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
      .select('id')
      .eq('subject_id', subject_id)
      .eq('grade_id', grade_id)
      .single();

    if (syllabusError) {
      console.warn("⚠️ No syllabus found for this subject/grade:", syllabusError.message);
      console.log("📝 Will generate study plan without specific chapters");
    } else {
      console.log("✅ Syllabus found:", syllabusData.id);
    }

    let chapters: any[] = [];
    if (syllabusData) {
      const { data: chaptersData, error: chaptersError } = await supabaseClient
        .from('syllabus_chapters')
        .select('id, chapter_number, chapter_title')
        .eq('syllabus_id', syllabusData.id)
        .order('chapter_number');

      if (chaptersError) {
        console.error("❌ Error fetching chapters:", chaptersError);
      } else {
        chapters = chaptersData || [];
        console.log(`✅ Found ${chapters.length} chapters`);
        chapters.forEach(ch => {
          console.log(`   - Chapter ${ch.chapter_number}: ${ch.chapter_title}`);
        });
      }
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
    const chaptersInfo = chapters && chapters.length > 0
      ? chapters.map(ch => `Chapter ${ch.chapter_number}: ${ch.chapter_title}`).join('\n')
      : 'No specific chapters available';

    console.log("📝 Preparing AI prompt...");
    console.log("📚 Chapters info:", chaptersInfo);

    const prompt = `You are an expert education planner. Generate a detailed study plan for a student with the following requirements:

Subject: ${subjectName}
Grade Level: ${gradeName}
Study Duration per Session: ${study_duration_minutes} minutes
Sessions per Week: ${sessions_per_week}
Preferred Study Times: ${preferred_times.join(', ')}
Start Date: ${start_date}
End Date: ${end_date}

Available Chapters:
${chaptersInfo}

Please generate a JSON array of study events with the following structure:
[
  {
    "title": "Study Session Title",
    "description": "Brief description of what to study",
    "date": "YYYY-MM-DD",
    "start_time": "HH:MM",
    "end_time": "HH:MM",
    "chapter_number": 1 or null,
    "topics": ["topic1", "topic2"]
  }
]

Requirements:
1. Distribute ${sessions_per_week} sessions per week
2. Each session should be ${study_duration_minutes} minutes long
3. Schedule sessions during ${preferred_times.join(' or ')} time slots
4. Cover all chapters systematically from start to finish
5. Include review sessions every few weeks
6. Start with easier topics and progress to harder ones
7. Add milestone checkpoints for assessments
8. Make sure dates are between ${start_date} and ${end_date}
9. Space out sessions appropriately (don't schedule consecutive days unless necessary)
10. For morning slots use 8:00-12:00, afternoon 13:00-17:00, evening 18:00-22:00

Return ONLY the JSON array, no additional text.`;

    console.log("🤖 Calling Gemini API...");
    console.log("📏 Prompt length:", prompt.length, "characters");

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
            parts: [{
              text: prompt
            }]
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

    console.log("💾 Inserting events into database...");
    const { data: insertedEvents, error: insertError } = await supabaseClient
      .from('study_plan_events')
      .insert(eventsToInsert)
      .select();

    if (insertError) {
      console.error('❌ Error inserting events:', insertError);
      console.error('Error details:', JSON.stringify(insertError, null, 2));
      throw insertError;
    }

    console.log(`✅ Successfully inserted ${insertedEvents.length} events`);
    console.log("📊 Inserted events summary:");
    insertedEvents.forEach((event, idx) => {
      console.log(`   ${idx + 1}. ${event.title} - ${event.event_date}`);
    });

    console.log("🎉 Study plan generation completed successfully!");
    console.log("⏰ Completion time:", new Date().toISOString());

    return new Response(
      JSON.stringify({
        success: true,
        events_created: insertedEvents.length,
        message: `Successfully generated ${insertedEvents.length} study sessions`
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
