import { useEffect, useState } from 'react';
import { X, MessageSquare, Plus, Send } from 'lucide-react';

export type OnboardingStep =
  | 'new-conversation'
  | 'select-paper'
  | 'toggle-chat'
  | 'ask-question'
  | 'completed';

interface OnboardingTutorialProps {
  currentStep: OnboardingStep;
  onComplete: () => void;
  onSkip: () => void;
  targetElementId?: string;
}

export function OnboardingTutorial({
  currentStep,
  onComplete,
  onSkip,
  targetElementId
}: OnboardingTutorialProps) {
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (targetElementId && currentStep !== 'completed') {
      const updateHighlight = () => {
        const element = document.getElementById(targetElementId);
        if (element) {
          const rect = element.getBoundingClientRect();
          setHighlightRect(rect);
        }
      };

      updateHighlight();
      window.addEventListener('resize', updateHighlight);
      window.addEventListener('scroll', updateHighlight);

      return () => {
        window.removeEventListener('resize', updateHighlight);
        window.removeEventListener('scroll', updateHighlight);
      };
    }
  }, [targetElementId, currentStep]);

  if (currentStep === 'completed') {
    return null;
  }

  const getStepConfig = () => {
    switch (currentStep) {
      case 'new-conversation':
        return {
          title: 'Start a New Conversation',
          description: 'Click the + button to begin chatting with an exam paper',
          icon: Plus,
          position: 'bottom' as const
        };
      case 'select-paper':
        return {
          title: 'Select an Exam Paper',
          description: 'Choose an exam paper you want to study or get help with',
          icon: MessageSquare,
          position: 'top' as const
        };
      case 'toggle-chat':
        return {
          title: 'Switch to Chat Assistant',
          description: 'Toggle to the chat view to start asking questions',
          icon: MessageSquare,
          position: 'bottom' as const
        };
      case 'ask-question':
        return {
          title: 'Ask Your First Question',
          description: 'Type a question about the exam paper and press send to get AI-powered help',
          icon: Send,
          position: 'top' as const
        };
      default:
        return null;
    }
  };

  const stepConfig = getStepConfig();
  if (!stepConfig) return null;

  const StepIcon = stepConfig.icon;

  return (
    <>
      {/* Dark overlay that greys out everything */}
      <div
        className="fixed inset-0 bg-black/70 transition-opacity z-[9998]"
        style={{ pointerEvents: 'none' }}
      />

      {/* Spotlight cutout for highlighted element */}
      {highlightRect && (
        <>
          {/* Create a "hole" in the overlay by using box-shadow */}
          <div
            className="fixed z-[9999] pointer-events-none transition-all duration-300"
            style={{
              top: highlightRect.top - 8,
              left: highlightRect.left - 8,
              width: highlightRect.width + 16,
              height: highlightRect.height + 16,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)',
              borderRadius: '12px',
            }}
          />

          {/* Pulsing border around highlighted element */}
          <div
            className="fixed z-[9999] pointer-events-none border-4 border-blue-500 rounded-xl animate-pulse transition-all duration-300"
            style={{
              top: highlightRect.top - 8,
              left: highlightRect.left - 8,
              width: highlightRect.width + 16,
              height: highlightRect.height + 16,
            }}
          />

          {/* Tooltip with instructions */}
          <div
            className="fixed z-[10000] max-w-sm"
            style={{
              top: stepConfig.position === 'bottom'
                ? highlightRect.bottom + 20
                : highlightRect.top - 140,
              left: Math.max(16, Math.min(
                window.innerWidth - 400,
                highlightRect.left + highlightRect.width / 2 - 200
              ))
            }}
          >
            <div className="bg-white rounded-lg shadow-2xl p-5 border-2 border-blue-500">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500 p-2 rounded-lg">
                    <StepIcon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{stepConfig.title}</h3>
                </div>
                <button
                  onClick={onSkip}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Skip tutorial"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                {stepConfig.description}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <div className={`w-2 h-2 rounded-full ${currentStep === 'new-conversation' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <div className={`w-2 h-2 rounded-full ${currentStep === 'select-paper' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <div className={`w-2 h-2 rounded-full ${currentStep === 'toggle-chat' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <div className={`w-2 h-2 rounded-full ${currentStep === 'ask-question' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                </div>
                <button
                  onClick={onSkip}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Skip tutorial
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
