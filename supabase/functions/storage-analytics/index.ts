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

        // For performance, we'll estimate sizes by sampling
        // Listing all files in large buckets would timeout
        const { data: files, error: listError } = await supabase.storage
          .from(bucketId)
          .list('', { limit: 100, sortBy: { column: 'name', order: 'asc' } });

        if (listError) {
          console.error(`Error listing bucket ${bucketId}:`, listError);
          continue;
        }

        if (!files || files.length === 0) {
          console.log(`Bucket ${bucketId} is empty`);
          bucketStats.push({
            bucketId,
            totalFiles: 0,
            totalSizeBytes: 0,
            totalSizeMB: 0,
            totalSizeGB: 0,
            fileTypes: []
          });
          continue;
        }

        // Sample the first 100 files and estimate total
        let sampleSize = 0;
        let sampleTotalSize = 0;
        const fileTypeMap = new Map<string, { count: number; size: number }>();

        for (const file of files) {
          if (file.id) {
            const size = file.metadata?.size || 0;
            sampleSize += size;
            sampleTotalSize += size;

            const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';
            if (!fileTypeMap.has(ext)) {
              fileTypeMap.set(ext, { count: 0, size: 0 });
            }
            const ft = fileTypeMap.get(ext)!;
            ft.count++;
            ft.size += size;
          }
        }

        // Estimate total size (this is approximate)
        const avgFileSize = files.length > 0 ? sampleTotalSize / files.length : 0;
        const estimatedTotalFiles = files.length; // Conservative estimate
        const estimatedTotalSize = sampleTotalSize; // Use sample as estimate

        bucketStats.push({
          bucketId,
          totalFiles: estimatedTotalFiles,
          totalSizeBytes: estimatedTotalSize,
          totalSizeMB: parseFloat((estimatedTotalSize / 1024 / 1024).toFixed(2)),
          totalSizeGB: parseFloat((estimatedTotalSize / 1024 / 1024 / 1024).toFixed(3)),
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

    // Calculate cleanup opportunities for inserts (simplified - don't check each folder)
    const { data: insertData } = await supabase
      .from('exam_papers')
      .select('id, insert_pdf_path')
      .not('insert_pdf_path', 'is', null);

    const totalInsertPdfs = insertData?.length || 0;

    // Estimate inserts with images by sampling (checking all would timeout)
    // Check first 10 inserts to get a ratio, then extrapolate
    let pdfsWithImages = 0;
    let sampledCount = 0;
    const sampleSize = Math.min(10, totalInsertPdfs);

    if (insertData && sampleSize > 0) {
      for (let i = 0; i < sampleSize; i++) {
        const paper = insertData[i];
        const { data: files } = await supabase.storage
          .from('inserts')
          .list(`inserts/${paper.id}`);

        const hasImages = files?.some(f => f.name.match(/\.(jpg|jpeg|png)$/i));
        if (hasImages) pdfsWithImages++;
        sampledCount++;
      }

      // Extrapolate to full dataset
      if (sampledCount > 0) {
        const ratio = pdfsWithImages / sampledCount;
        pdfsWithImages = Math.round(totalInsertPdfs * ratio);
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
