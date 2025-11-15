import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface MobilePdfViewerProps {
  pdfUrl?: string;
  pdfData?: Blob | null;
  examPaperImages?: string[];
  onLoadSuccess?: () => void;
  onLoadError?: () => void;
}

export function MobilePdfViewer({ examPaperImages, onLoadSuccess, onLoadError }: MobilePdfViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<number>(0);

  useEffect(() => {
    if (examPaperImages && examPaperImages.length > 0) {
      console.log(`Displaying ${examPaperImages.length} exam paper images on mobile`);
      setIsLoading(false);
      if (onLoadSuccess) {
        onLoadSuccess();
      }
    } else {
      console.log('No exam paper images available');
      setError('No exam paper images available');
      setIsLoading(false);
      if (onLoadError) {
        onLoadError();
      }
    }
  }, [examPaperImages]);

  const handleImageLoad = (index: number) => {
    setLoadedImages(prev => prev + 1);
    console.log(`Image ${index + 1} loaded`);
  };

  const handleImageError = (index: number) => {
    console.error(`Error loading image ${index + 1}`);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-gray-700 font-medium mb-2">Failed to load exam paper</p>
          <p className="text-sm text-gray-500">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-gray-400 mb-3" />
          <p className="text-gray-600">Loading exam paper...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full overflow-y-auto overflow-x-hidden bg-gray-100"
      style={{
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain'
      }}
    >
      <div className="p-4 space-y-4">
        {examPaperImages && examPaperImages.map((imageData, index) => (
          <div key={index} className="bg-white shadow-md rounded-lg overflow-hidden">
            <img
              src={`data:image/png;base64,${imageData}`}
              alt={`Exam paper page ${index + 1}`}
              className="w-full h-auto"
              loading={index < 2 ? 'eager' : 'lazy'}
              onLoad={() => handleImageLoad(index)}
              onError={() => handleImageError(index)}
              style={{
                display: 'block',
                maxWidth: '100%',
                height: 'auto'
              }}
            />
            {examPaperImages.length > 1 && (
              <div className="text-center py-2 text-xs text-gray-500 bg-gray-50">
                Page {index + 1} of {examPaperImages.length}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
