import { RefreshCw, X } from 'lucide-react';

interface Props {
  onUpdate: () => void;
  onDismiss: () => void;
}

export function UpdateNotification({ onUpdate, onDismiss }: Props) {
  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 max-w-md overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-white">
              <RefreshCw className="w-5 h-5" />
              <h3 className="font-semibold">Update Available</h3>
            </div>
            <button
              onClick={onDismiss}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-4">
          <p className="text-gray-700 mb-4">
            A new version of Aixampapers is available with improvements and bug fixes.
          </p>

          <div className="flex items-center space-x-3">
            <button
              onClick={onUpdate}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2.5 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 flex items-center justify-center space-x-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Update Now</span>
            </button>
            <button
              onClick={onDismiss}
              className="px-4 py-2.5 rounded-lg font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            >
              Later
            </button>
          </div>
        </div>

        {/* Bottom accent */}
        <div className="h-1 bg-gradient-to-r from-blue-600 to-purple-600"></div>
      </div>
    </div>
  );
}
