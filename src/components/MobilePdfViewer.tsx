import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface MobilePdfViewerProps {
  pdfUrl?: string;
  pdfData?: Blob | null;
  onLoadSuccess?: () => void;
  onLoadError?: () => void;
}

export function MobilePdfViewer({ pdfData, onLoadSuccess, onLoadError }: MobilePdfViewerProps) {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pdfData) {
      try {
        console.log('Creating blob URL for mobile PDF viewer');
        // Create blob URL from the PDF data
        const blobUrl = URL.createObjectURL(pdfData);
        setPdfBlobUrl(blobUrl);
        console.log('Blob URL created:', blobUrl);
        setIsLoading(false);

        // Cleanup function to revoke blob URL when component unmounts
        return () => {
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            console.log('Blob URL revoked');
          }
        };
      } catch (err) {
        console.error('Error creating blob URL:', err);
        setError('Failed to load PDF');
        setIsLoading(false);
        if (onLoadError) {
          onLoadError();
        }
      }
    }
  }, [pdfData]);

  const handleIframeLoad = () => {
    console.log('PDF iframe loaded successfully');
    setIsLoading(false);
    setError(null);
    if (onLoadSuccess) {
      onLoadSuccess();
    }
  };

  const handleIframeError = () => {
    console.error('PDF iframe failed to load');
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
          <p className="text-sm text-gray-500">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  if (isLoading && !pdfBlobUrl) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">Loading exam paper...</p>
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
            <p className="text-gray-600">Loading PDF...</p>
          </div>
        </div>
      )}
      <iframe
        src={pdfBlobUrl}
        className="w-full h-full border-0"
        title="Exam Paper"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      />
    </div>
  );
}
