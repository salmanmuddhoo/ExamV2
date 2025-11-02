import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

// PWA update notification
let updateAvailable = false;

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
          const newWorker = registration.installing;

          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available, prompt user to reload
                updateAvailable = true;

                // Show update notification
                if (confirm('A new version of the app is available! Click OK to update now.')) {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
