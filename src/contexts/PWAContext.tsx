import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAContextType {
  canInstall: boolean;
  isInstalled: boolean;
  showPrompt: boolean;
  installApp: () => Promise<void>;
  dismissPrompt: () => void;
  updateAvailable: boolean;
  updatePWA: () => void;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

const PROMPT_DISMISS_KEY = 'pwa_prompt_dismissed';
const PROMPT_DISMISS_COUNT_KEY = 'pwa_prompt_dismiss_count';
const MAX_DISMISSALS = 3; // Show prompt up to 3 times after dismissals

export function PWAProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // Check if app is already installed
    const checkInstallation = () => {
      const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                    (window.navigator as any).standalone ||
                    document.referrer.includes('android-app://');
      setIsInstalled(isPWA);
    };

    checkInstallation();

    // CRITICAL: Handle service worker updates for PWA
    // This ensures users get the latest code when it's available
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // Check for updates every 60 seconds when app is active
        setInterval(() => {
          registration.update();
        }, 60000);

        // Listen for new service worker waiting to activate
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker is installed and ready
                console.log('[PWA] Update available');
                setUpdateAvailable(true);
                setWaitingWorker(newWorker);
              }
            });
          }
        });
      });

      // Listen for controller change (service worker updated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] Controller changed - reloading');
        window.location.reload();
      });
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      setCanInstall(true);

      // Check if we should show the prompt based on dismissal count
      const dismissCount = parseInt(localStorage.getItem(PROMPT_DISMISS_COUNT_KEY) || '0', 10);
      const lastDismissed = localStorage.getItem(PROMPT_DISMISS_KEY);

      if (dismissCount < MAX_DISMISSALS) {
        // Show prompt after a short delay (2 seconds)
        setTimeout(() => {
          setShowPrompt(true);
        }, 2000);
      } else if (lastDismissed) {
        // If dismissed max times, check if it's been more than 7 days
        const lastDismissTime = parseInt(lastDismissed, 10);
        const daysSinceDismiss = (Date.now() - lastDismissTime) / (1000 * 60 * 60 * 24);

        if (daysSinceDismiss > 7) {
          // Reset dismiss count after 7 days
          localStorage.setItem(PROMPT_DISMISS_COUNT_KEY, '0');
          setTimeout(() => {
            setShowPrompt(true);
          }, 2000);
        }
      }
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      setShowPrompt(false);
      setDeferredPrompt(null);
      // Clear dismissal tracking
      localStorage.removeItem(PROMPT_DISMISS_KEY);
      localStorage.removeItem(PROMPT_DISMISS_COUNT_KEY);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === 'accepted') {
        setShowPrompt(false);
        // Clear dismissal tracking on acceptance
        localStorage.removeItem(PROMPT_DISMISS_KEY);
        localStorage.removeItem(PROMPT_DISMISS_COUNT_KEY);
      } else {
        dismissPrompt();
      }

      setDeferredPrompt(null);
      setCanInstall(false);
    } catch (error) {
      console.error('Error showing install prompt:', error);
    }
  };

  const dismissPrompt = () => {
    setShowPrompt(false);

    // Track dismissal count and time
    const currentCount = parseInt(localStorage.getItem(PROMPT_DISMISS_COUNT_KEY) || '0', 10);
    localStorage.setItem(PROMPT_DISMISS_COUNT_KEY, String(currentCount + 1));
    localStorage.setItem(PROMPT_DISMISS_KEY, String(Date.now()));
  };

  const updatePWA = () => {
    console.log('[PWA] Activating update...');
    if (waitingWorker) {
      // Tell the waiting service worker to skip waiting and become active
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setUpdateAvailable(false);
    }
  };

  return (
    <PWAContext.Provider value={{
      canInstall,
      isInstalled,
      showPrompt,
      installApp,
      dismissPrompt,
      updateAvailable,
      updatePWA
    }}>
      {children}
    </PWAContext.Provider>
  );
}

export function usePWA() {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error('usePWA must be used within a PWAProvider');
  }
  return context;
}
