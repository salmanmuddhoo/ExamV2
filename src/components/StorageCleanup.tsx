import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Trash2, AlertTriangle, CheckCircle, Info } from 'lucide-react';

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

interface CleanupResponse {
  success: boolean;
  dryRun: boolean;
  processed: number;
  deleted: number;
  savedBytes: number;
  savedMB: number;
  results: CleanupResult[];
}

export function StorageCleanup() {
  const [cleanupType, setCleanupType] = useState<'marking-schemes' | 'inserts' | 'both'>('marking-schemes');
  const [examPaperId, setExamPaperId] = useState<string>('');
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CleanupResponse | null>(null);
  const [error, setError] = useState<string>('');

  async function handleCleanup() {
    setLoading(true);
    setError('');
    setResults(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cleanup-storage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            examPaperId: examPaperId.trim() || undefined,
            cleanupType,
            dryRun
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Cleanup failed');
      }

      const data: CleanupResponse = await response.json();
      setResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-3 mb-6">
        <Trash2 className="w-6 h-6 text-red-600" />
        <h2 className="text-2xl font-bold text-gray-900">Storage Cleanup</h2>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-2">What gets deleted:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li><strong>Marking Scheme PDFs:</strong> Deleted if text version exists in database (AI uses text only)</li>
              <li><strong>Insert PDFs:</strong> Deleted if converted JPEG images exist (AI uses JPEGs only)</li>
            </ul>
            <p className="mt-3 font-semibold">What's kept:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>All exam paper PDFs (students need these for reference)</li>
              <li>All extracted question images (required for AI)</li>
              <li>All insert JPEG images (required for AI)</li>
              <li>Marking scheme text in database (required for AI)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Cleanup Options */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cleanup Type
          </label>
          <select
            value={cleanupType}
            onChange={(e) => setCleanupType(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="marking-schemes">Marking Scheme PDFs Only</option>
            <option value="inserts">Insert PDFs Only</option>
            <option value="both">Both Marking Schemes & Inserts</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Exam Paper ID (optional - leave blank for ALL papers)
          </label>
          <input
            type="text"
            value={examPaperId}
            onChange={(e) => setExamPaperId(e.target.value)}
            placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Leave blank to process all exam papers (bulk cleanup)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="dryRun"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="dryRun" className="text-sm font-medium text-gray-700">
            Dry Run (preview only, don't actually delete)
          </label>
        </div>
      </div>

      {/* Warning for Live Deletion */}
      {!dryRun && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="text-sm text-red-900">
              <p className="font-semibold">⚠️ LIVE DELETION MODE</p>
              <p>Files will be permanently deleted! Make sure you've tested with dry run first.</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={handleCleanup}
        disabled={loading}
        className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors ${
          dryRun
            ? 'bg-blue-600 hover:bg-blue-700'
            : 'bg-red-600 hover:bg-red-700'
        } disabled:bg-gray-400 disabled:cursor-not-allowed`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⚙️</span>
            Processing...
          </span>
        ) : dryRun ? (
          'Preview Cleanup (Dry Run)'
        ) : (
          '⚠️ DELETE FILES (LIVE)'
        )}
      </button>

      {/* Error Display */}
      {error && (
        <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="text-sm text-red-900">
              <p className="font-semibold">Error</p>
              <p>{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Display */}
      {results && (
        <div className="mt-6 space-y-4">
          {/* Summary */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
              <div className="text-sm text-green-900">
                <p className="font-semibold mb-2">
                  {results.dryRun ? 'Preview Results' : 'Cleanup Completed'}
                </p>
                <ul className="space-y-1">
                  <li>Exam papers processed: <strong>{results.processed}</strong></li>
                  <li>Files {results.dryRun ? 'that would be' : ''} deleted: <strong>{results.deleted}</strong></li>
                  <li>Storage {results.dryRun ? 'that would be' : ''} saved: <strong>{results.savedMB.toFixed(2)} MB</strong></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Detailed Results */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Detailed Results</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {results.results.map((result) => (
                <div key={result.examPaperId} className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">{result.examPaperTitle}</h4>

                  {result.markingScheme && (
                    <div className="mb-2 text-sm">
                      <span className="font-medium">Marking Scheme: </span>
                      {result.markingScheme.pdfExists ? (
                        result.markingScheme.textExists ? (
                          <span className="text-green-600">
                            ✓ {result.markingScheme.deleted ? 'Deleted' : 'Can be deleted'} (text exists)
                            {result.markingScheme.savedBytes && ` - Saved ${(result.markingScheme.savedBytes / 1024 / 1024).toFixed(2)} MB`}
                          </span>
                        ) : (
                          <span className="text-yellow-600">⚠ Kept (no text in DB yet)</span>
                        )
                      ) : (
                        <span className="text-gray-500">No PDF</span>
                      )}
                    </div>
                  )}

                  {result.insert && (
                    <div className="text-sm">
                      <span className="font-medium">Insert: </span>
                      {result.insert.pdfExists ? (
                        result.insert.imagesExist ? (
                          <span className="text-green-600">
                            ✓ {result.insert.deleted ? 'Deleted' : 'Can be deleted'} ({result.insert.imageCount} images exist)
                            {result.insert.savedBytes && ` - Saved ${(result.insert.savedBytes / 1024 / 1024).toFixed(2)} MB`}
                          </span>
                        ) : (
                          <span className="text-yellow-600">⚠ Kept (no images found yet)</span>
                        )
                      ) : (
                        <span className="text-gray-500">No PDF</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Next Steps */}
          {results.dryRun && results.deleted > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-900">
                  <p className="font-semibold mb-2">Next Steps:</p>
                  <ol className="list-decimal ml-5 space-y-1">
                    <li>Review the results above carefully</li>
                    <li>Test with a single exam paper first (enter Exam Paper ID)</li>
                    <li>Once confirmed, uncheck "Dry Run" to perform actual deletion</li>
                    <li>For bulk cleanup, leave Exam Paper ID blank and uncheck "Dry Run"</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
