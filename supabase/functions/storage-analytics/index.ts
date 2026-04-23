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

    // Get bucket statistics from storage.objects table
    const { data: bucketData, error: bucketError } = await supabase.rpc('get_storage_stats');

    if (bucketError) {
      console.error("Error getting bucket stats:", bucketError);
      // Fallback: query storage.objects directly
      const { data: objectsData, error: objectsError } = await supabase
        .from('storage.objects')
        .select('bucket_id, name, metadata');

      if (objectsError) {
        throw new Error(`Failed to fetch storage data: ${objectsError.message}`);
      }

      // Manually aggregate
      const bucketMap = new Map<string, any>();

      for (const obj of objectsData || []) {
        if (!bucketMap.has(obj.bucket_id)) {
          bucketMap.set(obj.bucket_id, {
            bucketId: obj.bucket_id,
            totalFiles: 0,
            totalSizeBytes: 0,
            fileTypes: new Map()
          });
        }

        const bucket = bucketMap.get(obj.bucket_id);
        bucket.totalFiles++;

        const size = obj.metadata?.size || 0;
        bucket.totalSizeBytes += size;

        // Extract file extension
        const ext = obj.name.split('.').pop()?.toLowerCase() || 'unknown';
        if (!bucket.fileTypes.has(ext)) {
          bucket.fileTypes.set(ext, { extension: ext, count: 0, sizeBytes: 0 });
        }
        const fileType = bucket.fileTypes.get(ext);
        fileType.count++;
        fileType.sizeBytes += size;
      }

      // Convert to array and calculate MB/GB
      const buckets: BucketStats[] = Array.from(bucketMap.values()).map(bucket => ({
        bucketId: bucket.bucketId,
        totalFiles: bucket.totalFiles,
        totalSizeBytes: bucket.totalSizeBytes,
        totalSizeMB: parseFloat((bucket.totalSizeBytes / 1024 / 1024).toFixed(2)),
        totalSizeGB: parseFloat((bucket.totalSizeBytes / 1024 / 1024 / 1024).toFixed(3)),
        fileTypes: Array.from(bucket.fileTypes.values()).map(ft => ({
          extension: ft.extension,
          count: ft.count,
          sizeBytes: ft.sizeBytes,
          sizeMB: parseFloat((ft.sizeBytes / 1024 / 1024).toFixed(2))
        })).sort((a, b) => b.sizeBytes - a.sizeBytes)
      }));

      const totalStorageBytes = buckets.reduce((sum, b) => sum + b.totalSizeBytes, 0);

      // Calculate cleanup opportunities for marking schemes
      const { data: markingSchemeStats } = await supabase.rpc('get_marking_scheme_cleanup_stats');

      // Calculate cleanup opportunities for inserts
      const { data: insertStats } = await supabase.rpc('get_insert_cleanup_stats');

      const analytics: StorageAnalytics = {
        totalStorageBytes,
        totalStorageMB: parseFloat((totalStorageBytes / 1024 / 1024).toFixed(2)),
        totalStorageGB: parseFloat((totalStorageBytes / 1024 / 1024 / 1024).toFixed(3)),
        buckets,
        cleanupOpportunities: {
          markingSchemes: markingSchemeStats || {
            totalPdfs: 0,
            pdfsWithText: 0,
            pdfsWithoutText: 0,
            potentialSavingsBytes: 0,
            potentialSavingsMB: 0
          },
          inserts: insertStats || {
            totalPdfs: 0,
            pdfsWithImages: 0,
            pdfsWithoutImages: 0,
            potentialSavingsBytes: 0,
            potentialSavingsMB: 0
          }
        }
      };

      console.log(`Total storage: ${analytics.totalStorageGB} GB`);
      console.log(`Buckets analyzed: ${buckets.length}`);

      return new Response(
        JSON.stringify(analytics),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // If RPC function exists and works, use its result
    return new Response(
      JSON.stringify(bucketData),
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
