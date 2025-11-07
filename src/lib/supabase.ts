import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Detect if running as PWA (installed on device)
const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
              (window.navigator as any).standalone ||
              document.referrer.includes('android-app://');

// CRITICAL: Use separate storage keys for browser vs PWA to prevent session conflicts
// This ensures browser and PWA sessions are completely isolated
const storageKey = isPWA ? 'supabase.auth.token.pwa' : 'supabase.auth.token.web';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: storageKey, // Different keys for browser vs PWA
    flowType: 'pkce',
    // Important for PWA: Ensure debug mode is disabled in production
    debug: false,
  },
  global: {
    headers: {
      // Add header to identify PWA requests
      'X-Client-Info': isPWA ? 'pwa' : 'web',
    },
  },
});

// Utility function to clear all auth-related storage
export const clearAllAuthStorage = () => {
  // Clear both PWA and web storage keys
  localStorage.removeItem('supabase.auth.token.pwa');
  localStorage.removeItem('supabase.auth.token.web');
  localStorage.removeItem('supabase.auth.token'); // Legacy key

  // Clear PWA OAuth tracking flags
  localStorage.removeItem('pwa_oauth_initiated');
  localStorage.removeItem('pwa_oauth_provider');
  localStorage.removeItem('pwa_oauth_timestamp');

  // Clear any session-related sessionStorage
  sessionStorage.removeItem('currentView');
  sessionStorage.removeItem('pwa_oauth_initiated');
  sessionStorage.removeItem('pwa_oauth_provider');
  sessionStorage.removeItem('pwa_oauth_timestamp');
};

// Utility to detect and clear cross-context sessions
export const validateSessionContext = async () => {
  const currentContext = isPWA ? 'pwa' : 'web';
  const otherContext = isPWA ? 'web' : 'pwa';
  const otherStorageKey = isPWA ? 'supabase.auth.token.web' : 'supabase.auth.token.pwa';

  // Check if there's a session in the other context
  const otherSession = localStorage.getItem(otherStorageKey);

  if (otherSession) {
    console.log(`[Session Isolation] Found ${otherContext} session in ${currentContext} context - keeping separate`);
    // Sessions are now isolated by storage key, so no action needed
  }

  // Validate current session
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      // Clear invalid session
      clearAllAuthStorage();
      return false;
    }
    return true;
  } catch (e) {
    clearAllAuthStorage();
    return false;
  }
};
