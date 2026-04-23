import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { HardDrive, Database, FileText, Image, Trash2, TrendingDown, RefreshCw } from 'lucide-react';

interface FileTypeStats {
  extension: string;
  count: number;
  sizeBytes: number;
  sizeMB: number;
}

interface BucketStats {
  bucketId: string;
  totalFiles: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  totalSizeGB: number;
  fileTypes: FileTypeStats[];
}

interface CleanupOpportunity {
  totalPdfs: number;
  pdfsWithText?: number;
  pdfsWithImages?: number;
  pdfsWithoutText?: number;
  pdfsWithoutImages?: number;
  potentialSavingsBytes: number;
  potentialSavingsMB: number;
  potentialSavingsGB?: number;
  averagePdfSizeBytes?: number;
  averagePdfSizeMB?: number;
}

interface StorageAnalytics {
  totalStorageBytes: number;
  totalStorageMB: number;
  totalStorageGB: number;
  buckets: BucketStats[];
  cleanupOpportunities: {
    markingSchemes: CleanupOpportunity;
    inserts: CleanupOpportunity;
  };
}

export function StorageAnalytics() {
  const [analytics, setAnalytics] = useState<StorageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/storage-analytics`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load analytics');
      }

      const data: StorageAnalytics = await response.json();
      setAnalytics(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${bytes} bytes`;
  };

  const getBucketDisplayName = (bucketId: string) => {
    const names: Record<string, string> = {
      'exam-papers': 'Exam Papers',
      'marking-schemes': 'Marking Schemes',
      'exam-questions': 'Question Images',
      'inserts': 'Insert Materials',
      'payment-proofs': 'Payment Proofs',
      'syllabus-files': 'Syllabus Files',
      'profile-pictures': 'Profile Pictures'
    };
    return names[bucketId] || bucketId;
  };

  const getBucketIcon = (bucketId: string) => {
    if (bucketId.includes('exam') || bucketId.includes('question')) return FileText;
    if (bucketId.includes('image') || bucketId.includes('picture')) return Image;
    return Database;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="ml-3 text-gray-600">Loading storage analytics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-900 font-semibold">Error</p>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const totalCleanupSavings =
    analytics.cleanupOpportunities.markingSchemes.potentialSavingsBytes +
    analytics.cleanupOpportunities.inserts.potentialSavingsBytes;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HardDrive className="w-8 h-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Storage Analytics</h2>
              <p className="text-sm text-gray-500">Overview of storage usage across all buckets</p>
            </div>
          </div>
          <button
            onClick={loadAnalytics}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Total Storage Card */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-6 h-6" />
          <h3 className="text-lg font-semibold">Total Storage Used</h3>
        </div>
        <p className="text-4xl font-bold mb-2">{analytics.totalStorageGB.toFixed(2)} GB</p>
        <p className="text-blue-100 text-sm">
          {analytics.totalStorageMB.toLocaleString()} MB across {analytics.buckets.length} storage buckets
        </p>
      </div>

      {/* Cleanup Opportunities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Marking Schemes Cleanup */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-green-600" />
            <h3 className="text-lg font-semibold">Marking Schemes Cleanup</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total PDFs:</span>
              <span className="font-semibold">{analytics.cleanupOpportunities.markingSchemes.totalPdfs.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Safe to delete (text extracted):</span>
              <span className="font-semibold text-green-600">
                {analytics.cleanupOpportunities.markingSchemes.pdfsWithText?.toLocaleString() || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Need processing:</span>
              <span className="font-semibold text-yellow-600">
                {analytics.cleanupOpportunities.markingSchemes.pdfsWithoutText?.toLocaleString() || 0}
              </span>
            </div>
            <div className="pt-3 border-t border-gray-200">
              <div className="flex items-center gap-2 text-green-600">
                <TrendingDown className="w-5 h-5" />
                <div>
                  <p className="font-semibold">Potential Savings</p>
                  <p className="text-2xl font-bold">
                    {analytics.cleanupOpportunities.markingSchemes.potentialSavingsGB
                      ? `${analytics.cleanupOpportunities.markingSchemes.potentialSavingsGB.toFixed(2)} GB`
                      : `${analytics.cleanupOpportunities.markingSchemes.potentialSavingsMB.toFixed(2)} MB`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Inserts Cleanup */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <Image className="w-6 h-6 text-purple-600" />
            <h3 className="text-lg font-semibold">Insert PDFs Cleanup</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total PDFs:</span>
              <span className="font-semibold">{analytics.cleanupOpportunities.inserts.totalPdfs.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Safe to delete (images exist):</span>
              <span className="font-semibold text-green-600">
                {analytics.cleanupOpportunities.inserts.pdfsWithImages?.toLocaleString() || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Need processing:</span>
              <span className="font-semibold text-yellow-600">
                {analytics.cleanupOpportunities.inserts.pdfsWithoutImages?.toLocaleString() || 0}
              </span>
            </div>
            <div className="pt-3 border-t border-gray-200">
              <div className="flex items-center gap-2 text-purple-600">
                <TrendingDown className="w-5 h-5" />
                <div>
                  <p className="font-semibold">Potential Savings</p>
                  <p className="text-2xl font-bold">
                    {analytics.cleanupOpportunities.inserts.potentialSavingsGB
                      ? `${analytics.cleanupOpportunities.inserts.potentialSavingsGB.toFixed(2)} GB`
                      : `${analytics.cleanupOpportunities.inserts.potentialSavingsMB.toFixed(2)} MB`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Total Cleanup Potential */}
      {totalCleanupSavings > 0 && (
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <Trash2 className="w-6 h-6" />
            <h3 className="text-lg font-semibold">Total Cleanup Potential</h3>
          </div>
          <p className="text-4xl font-bold mb-2">
            {formatBytes(totalCleanupSavings)}
          </p>
          <p className="text-green-100 text-sm">
            Can be freed up by deleting redundant PDFs (text/images already extracted)
          </p>
        </div>
      )}

      {/* Bucket Breakdown */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Storage by Bucket</h3>
        <div className="space-y-4">
          {analytics.buckets.sort((a, b) => b.totalSizeBytes - a.totalSizeBytes).map((bucket) => {
            const Icon = getBucketIcon(bucket.bucketId);
            const percentage = (bucket.totalSizeBytes / analytics.totalStorageBytes * 100).toFixed(1);

            return (
              <div key={bucket.bucketId} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-semibold">{getBucketDisplayName(bucket.bucketId)}</p>
                      <p className="text-xs text-gray-500">{bucket.totalFiles.toLocaleString()} files</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-lg">{bucket.totalSizeGB.toFixed(2)} GB</p>
                    <p className="text-xs text-gray-500">{percentage}% of total</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                {/* File Types */}
                {bucket.fileTypes.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Top file types:</p>
                    <div className="flex flex-wrap gap-2">
                      {bucket.fileTypes.slice(0, 5).map((ft) => (
                        <span
                          key={ft.extension}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                        >
                          .{ft.extension}: {ft.count} files ({ft.sizeMB.toFixed(1)} MB)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
