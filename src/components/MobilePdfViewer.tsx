import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, AlertCircle } from 'lucide-react';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface MobilePdfViewerProps {
  pdfUrl?: string;
  pdfData?: Blob | null;
  onLoadSuccess?: () => void;
  onLoadError?: () => void;
}

export function MobilePdfViewer({ pdfUrl, pdfData, onLoadSuccess, onLoadError }: MobilePdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    loadPdf();
  }, [pdfData, pdfUrl]);

  async function loadPdf() {
    try {
      console.log('Starting PDF load...');
      console.log('PDF Data:', pdfData ? 'Blob present' : 'No blob');
      console.log('PDF URL:', pdfUrl);

      setIsLoading(true);
      setError(null);

      let pdfSource;

      if (pdfData) {
        // Use blob data directly
        console.log('Using blob data');
        const arrayBuffer = await pdfData.arrayBuffer();
        pdfSource = { data: arrayBuffer };
      } else if (pdfUrl) {
        // Use URL as fallback
        console.log('Using URL');
        pdfSource = { url: pdfUrl };
      } else {
        throw new Error('No PDF source provided');
      }

      const loadingTask = pdfjsLib.getDocument(pdfSource);
      const pdf = await loadingTask.promise;

      console.log('PDF loaded successfully with', pdf.numPages, 'pages');
      setNumPages(pdf.numPages);

      // Render all pages
      const viewport = (await pdf.getPage(1)).getViewport({ scale: 1 });
      const containerWidth = window.innerWidth - 32; // 32px padding
      const scale = containerWidth / viewport.width;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        await renderPage(pdf, pageNum, scale);
      }

      setIsLoading(false);
      if (onLoadSuccess) {
        onLoadSuccess();
      }
    } catch (err) {
      console.error('Error loading PDF:', err);
      console.error('Error details:', err instanceof Error ? err.message : String(err));
      setError('Failed to load PDF. Please try again.');
      setIsLoading(false);
      if (onLoadError) {
        onLoadError();
      }
    }
  }

  async function renderPage(pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number, scale: number) {
    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Failed to get canvas context');
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.className = 'shadow-lg mb-4 w-full';

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      canvasRefs.current.set(pageNumber, canvas);
      setRenderedPages(prev => prev + 1);

      // Append to container
      if (containerRef.current) {
        containerRef.current.appendChild(canvas);
      }
    } catch (err) {
      console.error(`Error rendering page ${pageNumber}:`, err);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">Loading exam paper...</p>
          {numPages > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              Rendering {renderedPages} of {numPages} pages
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-gray-100">
      <div ref={containerRef} className="flex flex-col items-center py-4 px-4" />
    </div>
  );
}
