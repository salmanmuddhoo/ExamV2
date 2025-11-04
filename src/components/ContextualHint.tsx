import { useState, useEffect } from 'react';
import { X, Lightbulb } from 'lucide-react';

interface ContextualHintProps {
  show: boolean;
  onDismiss: () => void;
  title: string;
  message: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function ContextualHint({
  show,
  onDismiss,
  title,
  message,
  position = 'bottom',
  delay = 500,
}: ContextualHintProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        setVisible(true);
      }, delay);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [show, delay]);

  if (!visible) return null;

  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-blue-600',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-blue-600',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-blue-600',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-blue-600',
  };

  return (
    <div className={`absolute ${positionClasses[position]} z-50 animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className="relative">
        {/* Arrow */}
        <div
          className={`absolute ${arrowClasses[position]} w-0 h-0 border-[8px]`}
          style={{ zIndex: 1 }}
        />

        {/* Hint Card */}
        <div className="bg-gradient-to-br from-blue-600 to-purple-600 text-white rounded-lg shadow-2xl max-w-xs w-64 overflow-hidden">
          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div className="bg-white/20 rounded-full p-1.5">
                  <Lightbulb className="w-4 h-4" />
                </div>
                <h4 className="font-semibold text-sm">{title}</h4>
              </div>
              <button
                onClick={onDismiss}
                className="text-white/80 hover:text-white transition-colors"
                aria-label="Dismiss hint"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-white/90 leading-relaxed">{message}</p>
          </div>
          <div className="bg-white/10 px-4 py-2 flex justify-end">
            <button
              onClick={onDismiss}
              className="text-xs font-medium text-white hover:text-white/80 transition-colors"
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
