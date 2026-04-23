import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CleanupRequest {
  examPaperId?: string; // Specific exam paper ID, or omit for bulk cleanup
  cleanupType: 'marking-schemes' | 'inserts' | 'both';
  dryRun?: boolean; // If true, only report what would be deleted without actually deleting
}

interface CleanupResult {
  examPaperId: string;
  examPaperTitle: string;
  markingScheme?: {
    pdfExists: boolean;
    textExists: boolean;
    deleted: boolean;
    pdfPath?: string;
    savedBytes?: number;
  };
  insert?: {
    pdfExists: boolean;
    imagesExist: boolean;
    imageCount?: number;
    deleted: boolean;
    pdfPath?: string;
    savedBytes?: number;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Verify user is admin
    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Authentication failed");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    // Parse request body
    const body: CleanupRequest = await req.json();
    const { examPaperId, cleanupType, dryRun = true } = body;

    console.log(`=== STORAGE CLEANUP STARTED ===`);
    console.log(`Type: ${cleanupType}`);
    console.log(`Mode: ${dryRun ? 'DRY RUN (no actual deletion)' : 'LIVE DELETION'}`);
    console.log(`Scope: ${examPaperId ? `Single exam paper (${examPaperId})` : 'ALL exam papers'}`);

    // Get exam papers to process
    let examPapersQuery = supabase
      .from('exam_papers')
      .select('id, title, pdf_path, insert_pdf_path, insert_pdf_url');

    if (examPaperId) {
      examPapersQuery = examPapersQuery.eq('id', examPaperId);
    }

    const { data: examPapers, error: fetchError } = await examPapersQuery;

    if (fetchError) {
      throw new Error(`Failed to fetch exam papers: ${fetchError.message}`);
    }

    if (!examPapers || examPapers.length === 0) {
      throw new Error(examPaperId ? `Exam paper ${examPaperId} not found` : 'No exam papers found');
    }

    console.log(`Processing ${examPapers.length} exam paper(s)...`);

    const results: CleanupResult[] = [];
    let totalSavedBytes = 0;
    let totalDeleted = 0;

    for (const paper of examPapers) {
      const result: CleanupResult = {
        examPaperId: paper.id,
        examPaperTitle: paper.title
      };

      // ========== CLEANUP MARKING SCHEMES ==========
      if (cleanupType === 'marking-schemes' || cleanupType === 'both') {
        // Check if marking scheme exists for this exam paper
        const { data: markingScheme, error: msError } = await supabase
          .from('marking_schemes')
          .select('pdf_path')
          .eq('exam_paper_id', paper.id)
          .single();

        if (!msError && markingScheme?.pdf_path) {
          // Marking scheme PDF exists - check if we have the text
          const { data: questions, error: questionsError } = await supabase
            .from('exam_questions')
            .select('marking_scheme_text')
            .eq('exam_paper_id', paper.id)
            .not('marking_scheme_text', 'is', null);

          const hasText = !questionsError && questions && questions.length > 0;

          result.markingScheme = {
            pdfExists: true,
            textExists: hasText,
            deleted: false,
            pdfPath: markingScheme.pdf_path
          };

          if (hasText) {
            // We have the text version, safe to delete PDF
            console.log(`📄 ${paper.title}: Marking scheme PDF can be deleted (text exists in DB)`);

            if (!dryRun) {
              // Get file size before deletion
              const { data: fileData } = await supabase.storage
                .from('marking-schemes')
                .list(markingScheme.pdf_path.split('/').slice(0, -1).join('/'));

              const fileName = markingScheme.pdf_path.split('/').pop();
              const fileInfo = fileData?.find(f => f.name === fileName);
              const fileSize = fileInfo?.metadata?.size || 0;

              // Delete the PDF
              const { error: deleteError } = await supabase.storage
                .from('marking-schemes')
                .remove([markingScheme.pdf_path]);

              if (!deleteError) {
                result.markingScheme.deleted = true;
                result.markingScheme.savedBytes = fileSize;
                totalSavedBytes += fileSize;
                totalDeleted++;
                console.log(`✅ Deleted marking scheme PDF: ${markingScheme.pdf_path} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
              } else {
                console.error(`❌ Failed to delete marking scheme PDF: ${deleteError.message}`);
              }
            } else {
              console.log(`🔍 DRY RUN: Would delete ${markingScheme.pdf_path}`);
            }
          } else {
            console.log(`⚠️ ${paper.title}: Marking scheme PDF kept (no text in DB yet)`);
          }
        } else {
          result.markingScheme = {
            pdfExists: false,
            textExists: false,
            deleted: false
          };
        }
      }

      // ========== CLEANUP INSERTS ==========
      if (cleanupType === 'inserts' || cleanupType === 'both') {
        if (paper.insert_pdf_path) {
          // Insert PDF exists - check if we have the converted images
          const { data: insertFiles, error: listError } = await supabase.storage
            .from('inserts')
            .list(`inserts/${paper.id}`);

          const imageFiles = insertFiles?.filter(f => f.name.match(/\.(jpg|jpeg|png)$/i)) || [];
          const hasImages = !listError && imageFiles.length > 0;

          result.insert = {
            pdfExists: true,
            imagesExist: hasImages,
            imageCount: imageFiles.length,
            deleted: false,
            pdfPath: paper.insert_pdf_path
          };

          if (hasImages) {
            // We have the converted images, safe to delete original PDF
            console.log(`📎 ${paper.title}: Insert PDF can be deleted (${imageFiles.length} images exist)`);

            if (!dryRun) {
              // Get file size before deletion
              const pathParts = paper.insert_pdf_path.split('/');
              const { data: fileData } = await supabase.storage
                .from('inserts')
                .list(pathParts.slice(0, -1).join('/'));

              const fileName = pathParts.pop();
              const fileInfo = fileData?.find(f => f.name === fileName);
              const fileSize = fileInfo?.metadata?.size || 0;

              // Delete the PDF
              const { error: deleteError } = await supabase.storage
                .from('inserts')
                .remove([paper.insert_pdf_path]);

              if (!deleteError) {
                result.insert.deleted = true;
                result.insert.savedBytes = fileSize;
                totalSavedBytes += fileSize;
                totalDeleted++;

                // Also clear the insert_pdf_url and insert_pdf_path from database
                await supabase
                  .from('exam_papers')
                  .update({
                    insert_pdf_url: null,
                    insert_pdf_path: null
                  })
                  .eq('id', paper.id);

                console.log(`✅ Deleted insert PDF: ${paper.insert_pdf_path} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
              } else {
                console.error(`❌ Failed to delete insert PDF: ${deleteError.message}`);
              }
            } else {
              console.log(`🔍 DRY RUN: Would delete ${paper.insert_pdf_path}`);
            }
          } else {
            console.log(`⚠️ ${paper.title}: Insert PDF kept (no images found yet)`);
          }
        } else {
          result.insert = {
            pdfExists: false,
            imagesExist: false,
            deleted: false
          };
        }
      }

      results.push(result);
    }

    console.log(`=== CLEANUP COMPLETED ===`);
    console.log(`Files deleted: ${totalDeleted}`);
    console.log(`Storage saved: ${(totalSavedBytes / 1024 / 1024).toFixed(2)} MB`);

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        processed: examPapers.length,
        deleted: totalDeleted,
        savedBytes: totalSavedBytes,
        savedMB: parseFloat((totalSavedBytes / 1024 / 1024).toFixed(2)),
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error("Error in cleanup-storage:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "An error occurred",
        details: error.toString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
