import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { FirstTimeHintsProvider } from './contexts/FirstTimeHintsContext';
import { UpdateNotification } from './components/UpdateNotification';
import './index.css';

// PWA update notification
let updateAvailable = false;
let newServiceWorker: ServiceWorker | null = null;
let updateNotificationCallback: ((show: boolean) => void) | null = null;

// Register service worker for PWA with auto-update
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Check for updates when app becomes visible (user returns to tab)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update();
          }
        });

        // Check for updates periodically (every 30 seconds)
        setInterval(() => {
          registration.update();
        }, 30000);

        // Listen for new service worker waiting to activate
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;

          if (worker) {
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available, show custom notification
                updateAvailable = true;
                newServiceWorker = worker;

                // Trigger custom notification UI
                if (updateNotificationCallback) {
                  updateNotificationCallback(true);
                }
              }
            });
          }
        });

        // Reload page when new service worker takes control
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (updateAvailable) {
            window.location.reload();
          }
        });
      });
  });
}

// Root component with update notification
function Root() {
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);

  useEffect(() => {
    // Register callback for service worker to trigger notification
    updateNotificationCallback = setShowUpdateNotification;

    return () => {
      updateNotificationCallback = null;
    };
  }, []);

  const handleUpdate = () => {
    if (newServiceWorker) {
      newServiceWorker.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setShowUpdateNotification(false);
  };

  return (
    <>
      <AuthProvider>
        <FirstTimeHintsProvider>
          <App />
        </FirstTimeHintsProvider>
      </AuthProvider>
      {showUpdateNotification && (
        <UpdateNotification onUpdate={handleUpdate} onDismiss={handleDismiss} />
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
