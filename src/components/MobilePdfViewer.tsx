import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, AlertCircle } from 'lucide-react';

// Configure PDF.js worker with explicit CDN URL
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface MobilePdfViewerProps {
  pdfUrl?: string;
  pdfData?: Blob | null;
  onLoadSuccess?: () => void;
  onLoadError?: () => void;
}

export function MobilePdfViewer({ pdfData, pdfUrl, onLoadSuccess, onLoadError }: MobilePdfViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [loadedPages, setLoadedPages] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    loadAndRenderPdf();

    return () => {
      // Cleanup
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
      }
    };
  }, [pdfData, pdfUrl]);

  async function loadAndRenderPdf() {
    try {
      console.log('Starting PDF load for mobile...');
      setIsLoading(true);
      setError(null);
      setLoadedPages(0);

      // Get PDF data source
      let pdfSource: any;

      if (pdfData) {
        console.log('Loading from blob data');
        const arrayBuffer = await pdfData.arrayBuffer();
        pdfSource = { data: arrayBuffer };
      } else if (pdfUrl) {
        console.log('Loading from URL');
        pdfSource = { url: pdfUrl };
      } else {
        throw new Error('No PDF source provided');
      }

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument(pdfSource);
      const pdf = await loadingTask.promise;
      pdfDocRef.current = pdf;

      console.log(`PDF loaded: ${pdf.numPages} pages`);
      setNumPages(pdf.numPages);

      // Clear container
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }

      // Get viewport width for scaling
      const containerWidth = window.innerWidth - 32; // Account for padding

      // Render all pages
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        await renderPage(pdf, pageNum, containerWidth);
        setLoadedPages(pageNum);
      }

      setIsLoading(false);
      console.log('All pages rendered successfully');

      if (onLoadSuccess) {
        onLoadSuccess();
      }
    } catch (err) {
      console.error('Error loading/rendering PDF:', err);
      setError('Failed to load PDF');
      setIsLoading(false);

      if (onLoadError) {
        onLoadError();
      }
    }
  }

  async function renderPage(pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number, containerWidth: number) {
    try {
      const page = await pdf.getPage(pageNumber);

      // Calculate scale to fit container width
      const viewport = page.getViewport({ scale: 1.0 });
      const scale = containerWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      // Create canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });

      if (!context) {
        throw new Error('Could not get canvas context');
      }

      // Set canvas dimensions
      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;
      canvas.style.display = 'block';
      canvas.style.marginBottom = '8px';
      canvas.style.width = '100%';
      canvas.style.height = 'auto';

      // Render PDF page to canvas
      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport,
      };

      await page.render(renderContext).promise;

      // Add page number label
      const pageLabel = document.createElement('div');
      pageLabel.textContent = `Page ${pageNumber}`;
      pageLabel.style.textAlign = 'center';
      pageLabel.style.fontSize = '12px';
      pageLabel.style.color = '#666';
      pageLabel.style.marginBottom = '16px';
      pageLabel.style.marginTop = '8px';

      // Append to container
      if (containerRef.current) {
        containerRef.current.appendChild(canvas);
        if (pageNumber < pdf.numPages) {
          containerRef.current.appendChild(pageLabel);
        }
      }

      console.log(`Page ${pageNumber} rendered`);
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

  return (
    <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-gray-100" style={{ WebkitOverflowScrolling: 'touch' }}>
      {isLoading && (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <Loader2 className="w-12 h-12 animate-spin text-gray-400 mb-3" />
          <p className="text-gray-600 font-medium">Loading exam paper...</p>
          {numPages > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              Rendering page {loadedPages} of {numPages}
            </p>
          )}
          {numPages > 0 && (
            <div className="w-64 bg-gray-200 rounded-full h-2 mt-3 overflow-hidden">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(loadedPages / numPages) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}
      <div ref={containerRef} className="p-4" />
    </div>
  );
}
