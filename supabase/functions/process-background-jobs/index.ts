import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('=== Background Job Processor Started ===');

    // Get next job from queue
    const { data: jobId, error: jobError } = await supabase
      .rpc('get_next_processing_job');

    if (jobError) {
      console.error('Error getting next job:', jobError);
      return new Response(
        JSON.stringify({ error: 'Failed to get next job' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!jobId) {
      console.log('No pending jobs in queue');
      return new Response(
        JSON.stringify({ message: 'No pending jobs' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing job: ${jobId}`);

    // Fetch job details
    const { data: job, error: fetchError } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      console.error('Failed to fetch job details:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch job details' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process based on job type
    if (job.job_type === 'process_exam_paper') {
      await processExamPaperJob(job, supabase);
    } else {
      console.error(`Unknown job type: ${job.job_type}`);
      await supabase.rpc('fail_processing_job', {
        p_job_id: jobId,
        p_error_message: `Unknown job type: ${job.job_type}`,
        p_should_retry: false
      });
    }

    return new Response(
      JSON.stringify({ success: true, jobId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error in background processor:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processExamPaperJob(job: any, supabase: any) {
  try {
    const { exam_paper_id, payload } = job;
    const { base64Images, syllabusId, hasInsert } = payload;

    console.log(`Processing exam paper ${exam_paper_id} with ${base64Images.length} images`);

    // Update progress: Starting
    await supabase.rpc('update_job_progress', {
      p_job_id: job.id,
      p_progress_percentage: 5,
      p_current_step: 'Converting PDF to images'
    });

    // Convert base64Images array to the format expected by the existing function
    const pageImages = base64Images.map((img: string, idx: number) => ({
      pageNumber: idx + 1,
      base64Image: img
    }));

    // Call the existing process-exam-paper logic via HTTP
    // This is better than duplicating all the code
    const processUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-exam-paper`;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    await supabase.rpc('update_job_progress', {
      p_job_id: job.id,
      p_progress_percentage: 10,
      p_current_step: 'Analyzing exam paper with AI'
    });

    const response = await fetch(processUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'apikey': serviceKey,
      },
      body: JSON.stringify({
        examPaperId: exam_paper_id,
        pageImages: pageImages,
        markingSchemeImages: [], // TODO: Add support for marking scheme
        insertImages: hasInsert ? [] : undefined // TODO: Add support for insert
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Processing failed:', errorText);
      throw new Error(`Processing failed: ${errorText}`);
    }

    await supabase.rpc('update_job_progress', {
      p_job_id: job.id,
      p_progress_percentage: 90,
      p_current_step: 'Finalizing'
    });

    const result = await response.json();

    // Mark job as completed
    await supabase.rpc('complete_processing_job', {
      p_job_id: job.id,
      p_result: result
    });

    console.log(`✅ Job ${job.id} completed successfully`);

  } catch (error) {
    console.error(`Failed to process job ${job.id}:`, error);

    // Mark job as failed
    await supabase.rpc('fail_processing_job', {
      p_job_id: job.id,
      p_error_message: error.message,
      p_error_details: { error: error.toString() },
      p_should_retry: true
    });
  }
}
