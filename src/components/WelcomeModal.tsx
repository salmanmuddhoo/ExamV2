import { Sparkles, MessageSquare, FileText, ArrowRight, X } from 'lucide-react';
import { formatTokenCount } from '../lib/formatUtils';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokensRemaining: number;
  papersRemaining: number;
  onUpgrade?: () => void;
}

export function WelcomeModal({ isOpen, onClose, tokensRemaining, papersRemaining, onUpgrade }: WelcomeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-slideIn relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-white hover:text-gray-200 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-700 p-4 text-white">
          <div className="flex items-center justify-center mb-2">
            <div className="bg-white bg-opacity-20 p-2 rounded-full">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
          <h2 className="text-lg font-bold text-center mb-1">Welcome to Your AI Study Assistant!</h2>
          <p className="text-gray-300 text-center text-xs">
            You're all set to start studying smarter
          </p>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Free Tier Info */}
          <div className="bg-gray-50 rounded-xl p-3 mb-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-xs font-semibold">
                FREE TIER
              </div>
            </div>
            <p className="text-xs text-gray-700 mb-3">
              You're currently on our <strong>Free Plan</strong>. Here's what you get:
            </p>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-white rounded-lg p-2 border border-gray-200">
                <div className="flex items-center space-x-1 mb-1">
                  <MessageSquare className="w-3 h-3 text-gray-900" />
                  <span className="text-xs font-medium text-gray-600">AI Tokens</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatTokenCount(tokensRemaining)}</p>
                <p className="text-xs text-gray-500">per month</p>
              </div>

              <div className="bg-white rounded-lg p-2 border border-gray-200">
                <div className="flex items-center space-x-1 mb-1">
                  <FileText className="w-3 h-3 text-gray-900" />
                  <span className="text-xs font-medium text-gray-600">Exam Papers</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{papersRemaining}</p>
                <p className="text-xs text-gray-500">with AI chat</p>
              </div>
            </div>

            <div className="bg-gray-100 border border-gray-200 rounded-lg p-2">
              <p className="text-xs text-gray-800">
                <strong>💡 Pro Tip:</strong> Use your tokens wisely! Each question uses tokens.
              </p>
            </div>
          </div>

          {/* Upgrade CTA */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 mb-3 border border-gray-200">
            <p className="text-xs font-semibold text-gray-900 mb-1">
              Want unlimited access?
            </p>
            <p className="text-xs text-gray-600 mb-2">
              Upgrade to <strong>Student Package</strong> or <strong>Premium</strong> for unlimited exam papers, more AI tokens, and advanced features!
            </p>
            <button
              onClick={() => {
                if (onUpgrade) {
                  onUpgrade();
                }
                onClose();
              }}
              className="w-full bg-gradient-to-r from-gray-900 to-gray-700 text-white py-2 px-3 rounded-lg text-xs font-medium hover:from-gray-800 hover:to-gray-600 transition-all flex items-center justify-center space-x-2"
            >
              <span>Explore Plans</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Get Started Button */}
          <button
            onClick={onClose}
            className="w-full bg-gray-200 text-gray-900 py-2 px-3 rounded-lg text-xs font-medium hover:bg-gray-300 transition-colors"
          >
            Continue with Free Tier
          </button>
        </div>
      </div>
    </div>
  );
}
