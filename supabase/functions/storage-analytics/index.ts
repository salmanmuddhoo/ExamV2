import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BucketStats {
  bucketId: string;
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  totalSizeGB: number;
  fileTypes: {
    extension: string;
    count: number;
    sizeBytes: number;
    sizeMB: number;
  }[];
}

interface StorageAnalytics {
  totalStorageBytes: number;
  totalStorageMB: number;
  totalStorageGB: number;
  buckets: BucketStats[];
  cleanupOpportunities: {
    markingSchemes: {
      totalPdfs: number;
      pdfsWithText: number;
      pdfsWithoutText: number;
      potentialSavingsBytes: number;
      potentialSavingsMB: number;
    };
    inserts: {
      totalPdfs: number;
      pdfsWithImages: number;
      pdfsWithoutImages: number;
      potentialSavingsBytes: number;
      potentialSavingsMB: number;
    };
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

    // Verify admin access
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

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

    console.log("=== CALCULATING STORAGE ANALYTICS ===");

    // List all storage buckets
    const buckets = ['exam-papers', 'marking-schemes', 'exam-questions', 'inserts', 'payment-proofs', 'syllabus-files'];

    const bucketStats: BucketStats[] = [];

    for (const bucketId of buckets) {
      try {
        console.log(`Processing bucket: ${bucketId}`);
        const { data: files, error: listError } = await supabase.storage
          .from(bucketId)
          .list('', { limit: 10000 });

        if (listError) {
          console.error(`Error listing bucket ${bucketId}:`, listError);
          continue;
        }

        if (!files || files.length === 0) {
          console.log(`Bucket ${bucketId} is empty`);
          continue;
        }

        let totalSize = 0;
        const fileTypeMap = new Map<string, { count: number; size: number }>();

        // List files recursively
        const allFiles: any[] = [];

        async function listRecursively(path: string) {
          const { data, error } = await supabase.storage
            .from(bucketId)
            .list(path, { limit: 1000 });

          if (error || !data) return;

          for (const file of data) {
            if (file.id) {
              allFiles.push(file);
              const size = file.metadata?.size || 0;
              totalSize += size;

              const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';
              if (!fileTypeMap.has(ext)) {
                fileTypeMap.set(ext, { count: 0, size: 0 });
              }
              const ft = fileTypeMap.get(ext)!;
              ft.count++;
              ft.size += size;
            }
          }
        }

        await listRecursively('');

        bucketStats.push({
          bucketId,
          totalFiles: allFiles.length,
          totalSizeBytes: totalSize,
          totalSizeMB: parseFloat((totalSize / 1024 / 1024).toFixed(2)),
          totalSizeGB: parseFloat((totalSize / 1024 / 1024 / 1024).toFixed(3)),
          fileTypes: Array.from(fileTypeMap.entries()).map(([ext, data]) => ({
            extension: ext,
            count: data.count,
            sizeBytes: data.size,
            sizeMB: parseFloat((data.size / 1024 / 1024).toFixed(2))
          })).sort((a, b) => b.sizeBytes - a.sizeBytes)
        });

      } catch (error) {
        console.error(`Error processing bucket ${bucketId}:`, error);
      }
    }

    const totalStorageBytes = bucketStats.reduce((sum, b) => sum + b.totalSizeBytes, 0);

    const totalStorageBytes = bucketStats.reduce((sum, b) => sum + b.totalSizeBytes, 0);

    // Calculate cleanup opportunities for marking schemes (direct DB query)
    const { data: markingSchemeData } = await supabase
      .from('marking_schemes')
      .select('pdf_path');

    const totalMarkingPdfs = markingSchemeData?.length || 0;

    const { data: questionsWithText } = await supabase
      .from('exam_questions')
      .select('exam_paper_id')
      .not('marking_scheme_text', 'is', null);

    const pdfsWithText = new Set(questionsWithText?.map(q => q.exam_paper_id) || []).size;

    // Calculate cleanup opportunities for inserts (direct DB query)
    const { data: insertData } = await supabase
      .from('exam_papers')
      .select('id, insert_pdf_path')
      .not('insert_pdf_path', 'is', null);

    const totalInsertPdfs = insertData?.length || 0;

    // Check which inserts have images
    let pdfsWithImages = 0;
    if (insertData) {
      for (const paper of insertData) {
        const { data: files } = await supabase.storage
          .from('inserts')
          .list(`inserts/${paper.id}`);

        const hasImages = files?.some(f => f.name.match(/\.(jpg|jpeg|png)$/i));
        if (hasImages) pdfsWithImages++;
      }
    }

    // Estimate average sizes (15MB for marking schemes, 10MB for inserts)
    const avgMarkingSchemeSize = 15 * 1024 * 1024; // 15MB
    const avgInsertSize = 10 * 1024 * 1024; // 10MB

    const analytics: StorageAnalytics = {
      totalStorageBytes,
      totalStorageMB: parseFloat((totalStorageBytes / 1024 / 1024).toFixed(2)),
      totalStorageGB: parseFloat((totalStorageBytes / 1024 / 1024 / 1024).toFixed(3)),
      buckets: bucketStats,
      cleanupOpportunities: {
        markingSchemes: {
          totalPdfs: totalMarkingPdfs,
          pdfsWithText,
          pdfsWithoutText: totalMarkingPdfs - pdfsWithText,
          potentialSavingsBytes: pdfsWithText * avgMarkingSchemeSize,
          potentialSavingsMB: parseFloat((pdfsWithText * avgMarkingSchemeSize / 1024 / 1024).toFixed(2)),
          potentialSavingsGB: parseFloat((pdfsWithText * avgMarkingSchemeSize / 1024 / 1024 / 1024).toFixed(2))
        },
        inserts: {
          totalPdfs: totalInsertPdfs,
          pdfsWithImages,
          pdfsWithoutImages: totalInsertPdfs - pdfsWithImages,
          potentialSavingsBytes: pdfsWithImages * avgInsertSize,
          potentialSavingsMB: parseFloat((pdfsWithImages * avgInsertSize / 1024 / 1024).toFixed(2)),
          potentialSavingsGB: parseFloat((pdfsWithImages * avgInsertSize / 1024 / 1024 / 1024).toFixed(2))
        }
      }
    };

    console.log(`Total storage: ${analytics.totalStorageGB} GB`);
    console.log(`Buckets analyzed: ${bucketStats.length}`);
    console.log(`Marking schemes - Total: ${totalMarkingPdfs}, With text: ${pdfsWithText}`);
    console.log(`Inserts - Total: ${totalInsertPdfs}, With images: ${pdfsWithImages}`);

    return new Response(
      JSON.stringify(analytics),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error: any) {
    console.error("Error in storage-analytics:", error);

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
