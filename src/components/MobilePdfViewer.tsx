import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, AlertCircle } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker - use newer CDN URL with HTTPS
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface MobilePdfViewerProps {
  pdfUrl: string;
  onLoadSuccess?: () => void;
  onLoadError?: () => void;
}

export function MobilePdfViewer({ pdfUrl, onLoadSuccess, onLoadError }: MobilePdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageWidth, setPageWidth] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Calculate page width based on viewport
    const updateWidth = () => {
      const viewportWidth = window.innerWidth;
      setPageWidth(viewportWidth - 32); // 32px for padding (16px on each side)
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    console.log('PDF loaded successfully with', numPages, 'pages');
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
    if (onLoadSuccess) {
      onLoadSuccess();
    }
  }

  function onDocumentLoadError(error: Error) {
    console.error('Error loading PDF:', error);
    console.error('PDF URL:', pdfUrl);
    setError('Failed to load PDF. Please try again.');
    setIsLoading(false);
    if (onLoadError) {
      onLoadError();
    }
  }

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
    <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-gray-100">
      {isLoading && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">Loading exam paper...</p>
          </div>
        </div>
      )}

      <Document
        file={{
          url: pdfUrl,
          httpHeaders: {},
          withCredentials: false,
        }}
        options={{
          cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
        }}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        }
        className="flex flex-col items-center py-4 space-y-4"
      >
        {Array.from(new Array(numPages), (el, index) => (
          <div key={`page_${index + 1}`} className="shadow-lg">
            <Page
              pageNumber={index + 1}
              width={pageWidth}
              loading={
                <div className="flex items-center justify-center" style={{ width: pageWidth, height: pageWidth * 1.414 }}>
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              }
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </div>
        ))}
      </Document>
    </div>
  );
}
