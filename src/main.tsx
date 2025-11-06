import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { FirstTimeHintsProvider } from './contexts/FirstTimeHintsContext';
import { PWAProvider } from './contexts/PWAContext';
import './index.css';

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(() => {
        // Service Worker registered successfully
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <FirstTimeHintsProvider>
        <PWAProvider>
          <App />
        </PWAProvider>
      </FirstTimeHintsProvider>
    </AuthProvider>
  </StrictMode>
);
