import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface MobilePdfViewerProps {
  pdfUrl?: string;
  pdfData?: Blob | null;
  onLoadSuccess?: () => void;
  onLoadError?: () => void;
}

export function MobilePdfViewer({ pdfData, pdfUrl, onLoadSuccess, onLoadError }: MobilePdfViewerProps) {
  const [viewerUrl, setViewerUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setupViewer();
  }, [pdfData, pdfUrl]);

  async function setupViewer() {
    try {
      console.log('Setting up PDF viewer for mobile...');
      setIsLoading(true);
      setError(null);

      let pdfSourceUrl = '';

      if (pdfData) {
        // Create blob URL from PDF data
        console.log('Creating blob URL from PDF data');
        pdfSourceUrl = URL.createObjectURL(pdfData);
      } else if (pdfUrl) {
        // Use provided URL
        console.log('Using provided PDF URL');
        pdfSourceUrl = pdfUrl;
      } else {
        throw new Error('No PDF source provided');
      }

      // Construct viewer URL with PDF as query parameter
      const encodedPdfUrl = encodeURIComponent(pdfSourceUrl);
      const viewer = `/pdfjs/viewer.html?file=${encodedPdfUrl}`;

      console.log('Viewer URL:', viewer);
      setViewerUrl(viewer);

      // Cleanup blob URL when component unmounts
      return () => {
        if (pdfData && pdfSourceUrl) {
          URL.revokeObjectURL(pdfSourceUrl);
          console.log('Blob URL revoked');
        }
      };
    } catch (err) {
      console.error('Error setting up viewer:', err);
      setError('Failed to load PDF viewer');
      setIsLoading(false);
      if (onLoadError) {
        onLoadError();
      }
    }
  }

  const handleIframeLoad = () => {
    console.log('PDF viewer iframe loaded');
    setIsLoading(false);
    setError(null);
    if (onLoadSuccess) {
      onLoadSuccess();
    }
  };

  const handleIframeError = () => {
    console.error('PDF viewer iframe failed to load');
    setError('Failed to load PDF');
    setIsLoading(false);
    if (onLoadError) {
      onLoadError();
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-gray-700 font-medium mb-2">Failed to load PDF</p>
          <p className="text-sm text-gray-500">Please check your connection and try again</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative bg-gray-100">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">Loading PDF viewer...</p>
          </div>
        </div>
      )}
      {viewerUrl && (
        <iframe
          src={viewerUrl}
          className="w-full h-full border-0"
          title="PDF Viewer"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          sandbox="allow-scripts allow-same-origin"
        />
      )}
    </div>
  );
}
