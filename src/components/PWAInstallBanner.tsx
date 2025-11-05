import { X, Download, Smartphone } from 'lucide-react';
import { usePWA } from '../contexts/PWAContext';

interface PWAInstallBannerProps {
  variant?: 'floating' | 'inline' | 'header';
}

export function PWAInstallBanner({ variant = 'floating' }: PWAInstallBannerProps) {
  const { showPrompt, installApp, dismissPrompt } = usePWA();

  if (!showPrompt) return null;

  // Floating banner (bottom of screen)
  if (variant === 'floating') {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 animate-slide-up">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow-2xl overflow-hidden">
          <div className="p-4 text-white">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Install Aixampapers</h3>
                  <p className="text-sm text-white/90">Quick access from your home screen</p>
                </div>
              </div>
              <button
                onClick={dismissPrompt}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 mb-4 text-sm text-white/90">
              <p>✓ Instant access - no app store needed</p>
              <p>✓ Works offline with cached content</p>
              <p>✓ Fast & lightweight experience</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={installApp}
                className="flex-1 flex items-center justify-center space-x-2 bg-white text-blue-600 font-semibold px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Install Now</span>
              </button>
              <button
                onClick={dismissPrompt}
                className="px-4 py-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Inline banner (for pages/sections)
  if (variant === 'inline') {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-1">
                Install Aixampapers App
              </h4>
              <p className="text-sm text-gray-600 mb-3">
                Get instant access from your home screen. Works offline and loads faster!
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={installApp}
                  className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium px-4 py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all text-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Install App</span>
                </button>
                <button
                  onClick={dismissPrompt}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={dismissPrompt}
            className="p-1 hover:bg-gray-200 rounded transition-colors ml-2"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>
    );
  }

  // Header banner (top of screen)
  if (variant === 'header') {
    return (
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center space-x-3 flex-1">
              <Smartphone className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">
                Install Aixampapers for quick access and offline support
              </p>
            </div>
            <div className="flex items-center space-x-2 ml-4">
              <button
                onClick={installApp}
                className="flex items-center space-x-1 bg-white text-blue-600 font-semibold px-3 py-1 rounded hover:bg-white/90 transition-colors text-sm whitespace-nowrap"
              >
                <Download className="w-3 h-3" />
                <span>Install</span>
              </button>
              <button
                onClick={dismissPrompt}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
