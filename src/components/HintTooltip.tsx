import { useEffect, useState, useRef } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { Hint } from '../types/hints';

interface HintTooltipProps {
  hint: Hint;
  currentIndex: number;
  totalHints: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export function HintTooltip({
  hint,
  currentIndex,
  totalHints,
  onNext,
  onPrevious,
  onSkip,
  onClose
}: HintTooltipProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calculatePosition = () => {
      let targetElement: HTMLElement | null = null;

      if (hint.target === 'body' || hint.position === 'center') {
        // Center on screen
        const tooltip = tooltipRef.current;
        if (tooltip) {
          setPosition({
            top: window.innerHeight / 2 - tooltip.offsetHeight / 2,
            left: window.innerWidth / 2 - tooltip.offsetWidth / 2
          });
        }
        setIsVisible(true);
        return;
      }

      // Find target element
      targetElement = document.querySelector(hint.target) as HTMLElement;

      if (!targetElement) {
        console.warn(`Hint target not found: ${hint.target}`);
        // Default to center if target not found
        const tooltip = tooltipRef.current;
        if (tooltip) {
          setPosition({
            top: window.innerHeight / 2 - tooltip.offsetHeight / 2,
            left: window.innerWidth / 2 - tooltip.offsetWidth / 2
          });
        }
        setIsVisible(true);
        return;
      }

      const rect = targetElement.getBoundingClientRect();
      const tooltip = tooltipRef.current;

      if (!tooltip) return;

      const tooltipRect = tooltip.getBoundingClientRect();
      let top = 0;
      let left = 0;

      switch (hint.position) {
        case 'top':
          top = rect.top - tooltipRect.height - 10 + hint.offsetY;
          left = rect.left + rect.width / 2 - tooltipRect.width / 2 + hint.offsetX;
          break;
        case 'bottom':
          top = rect.bottom + 10 + hint.offsetY;
          left = rect.left + rect.width / 2 - tooltipRect.width / 2 + hint.offsetX;
          break;
        case 'left':
          top = rect.top + rect.height / 2 - tooltipRect.height / 2 + hint.offsetY;
          left = rect.left - tooltipRect.width - 10 + hint.offsetX;
          break;
        case 'right':
          top = rect.top + rect.height / 2 - tooltipRect.height / 2 + hint.offsetY;
          left = rect.right + 10 + hint.offsetX;
          break;
      }

      // Ensure tooltip stays within viewport
      const padding = 10;
      top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
      left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

      setPosition({ top, left });
      setIsVisible(true);

      // Highlight target element
      targetElement.classList.add('hint-highlight');
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // Small delay to allow DOM to render
    setTimeout(calculatePosition, 100);

    return () => {
      // Remove highlight from all elements
      document.querySelectorAll('.hint-highlight').forEach(el => {
        el.classList.remove('hint-highlight');
      });
    };
  }, [hint]);

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalHints - 1;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[9998]" onClick={onClose} />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={`fixed z-[9999] bg-white rounded-lg shadow-2xl border-2 border-blue-500 max-w-sm w-full transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-blue-50">
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 text-sm">{hint.title}</h3>
            <p className="text-xs text-gray-600 mt-0.5">
              Step {currentIndex + 1} of {totalHints}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            title="Close tutorial"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-gray-700 leading-relaxed">{hint.description}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onSkip}
            className="text-xs text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            Skip Tutorial
          </button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={onPrevious}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
                Back
              </button>
            )}
            <button
              onClick={onNext}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              {isLast ? 'Finish' : 'Next'}
              {!isLast && <ChevronRight className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1 pb-3">
          {Array.from({ length: totalHints }).map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex
                  ? 'bg-blue-600'
                  : index < currentIndex
                  ? 'bg-blue-300'
                  : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>
    </>
  );
}
