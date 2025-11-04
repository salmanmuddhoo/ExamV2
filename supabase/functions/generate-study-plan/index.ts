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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Get request body
    const requestData: StudyPlanRequest = await req.json();
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

    // Fetch subject and grade names
    const { data: subject } = await supabaseClient
      .from('subjects')
      .select('name')
      .eq('id', subject_id)
      .single();

    const { data: grade } = await supabaseClient
      .from('grade_levels')
      .select('name')
      .eq('id', grade_id)
      .single();

    const subjectName = subject?.name || 'Subject';
    const gradeName = grade?.name || 'Grade';

    // Fetch syllabus chapters for the subject
    const { data: chapters } = await supabaseClient
      .from('chapters')
      .select('id, chapter_number, chapter_title')
      .eq('subject_id', subject_id)
      .eq('grade_id', grade_id)
      .order('chapter_number');

    // Get Gemini API key
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("Gemini API key not configured");
    }

    // Prepare prompt for Gemini
    const chaptersInfo = chapters && chapters.length > 0
      ? chapters.map(ch => `Chapter ${ch.chapter_number}: ${ch.chapter_title}`).join('\n')
      : 'No specific chapters available';

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
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON from the response
    let studyEvents: any[] = [];
    try {
      // Try to find JSON in the response
      const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        studyEvents = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', generatedText);
      throw new Error('Failed to parse AI-generated study plan');
    }

    // Create a map of chapter titles to IDs
    const chapterMap = new Map(
      chapters?.map(ch => [ch.chapter_number, ch.id]) || []
    );

    // Insert events into database
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

    const { data: insertedEvents, error: insertError } = await supabaseClient
      .from('study_plan_events')
      .insert(eventsToInsert)
      .select();

    if (insertError) {
      console.error('Error inserting events:', insertError);
      throw insertError;
    }

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
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An error occurred while generating the study plan'
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
