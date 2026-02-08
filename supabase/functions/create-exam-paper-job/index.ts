import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateJobRequest {
  examPaperId: string;
  base64Images: string[];
  syllabusId?: string;
  hasInsert?: boolean;
  priority?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Verify user is admin
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    // Parse request body
    const body: CreateJobRequest = await req.json();
    const {
      examPaperId,
      base64Images,
      syllabusId,
      hasInsert = false,
      priority = 0,
    } = body;

    // Validate required fields
    if (!examPaperId || !base64Images || base64Images.length === 0) {
      throw new Error("Missing required fields: examPaperId and base64Images");
    }

    console.log(
      `Creating job for exam paper ${examPaperId} with ${base64Images.length} images`
    );

    // Create job in processing_jobs table
    const { data: job, error: jobError } = await supabaseClient
      .from("processing_jobs")
      .insert({
        job_type: "process_exam_paper",
        status: "pending",
        priority,
        exam_paper_id: examPaperId,
        payload: {
          base64Images,
          syllabusId,
          hasInsert,
          imageCount: base64Images.length,
        },
        progress_percentage: 0,
        current_step: "Queued for processing",
        created_by: user.id,
      })
      .select()
      .single();

    if (jobError) {
      console.error("Error creating job:", jobError);
      throw new Error(`Failed to create job: ${jobError.message}`);
    }

    console.log(`Job created successfully: ${job.id}`);

    // Trigger background processor asynchronously (fire and forget)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (supabaseUrl && serviceKey) {
      // Trigger the background processor without waiting for response
      fetch(`${supabaseUrl}/functions/v1/process-background-jobs`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          "apikey": serviceKey,
        },
        body: JSON.stringify({}),
      }).catch((err) => {
        console.error("Failed to trigger background processor:", err);
        // Non-critical error, job will be picked up eventually
      });
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        message: "Job created successfully. Processing will begin shortly.",
        estimatedTime: Math.ceil(base64Images.length * 2), // Rough estimate: 2 seconds per page
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in create-exam-paper-job:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "An error occurred",
        details: error.toString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
