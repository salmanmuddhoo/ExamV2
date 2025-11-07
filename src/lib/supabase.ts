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

// REVERT: Use single storage key for both browser and PWA
// Separate keys were causing OAuth switching issues
const storageKey = 'supabase.auth.token';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: storageKey,
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
  // Clear auth storage key
  localStorage.removeItem('supabase.auth.token');
  // Clear legacy keys if they exist
  localStorage.removeItem('supabase.auth.token.pwa');
  localStorage.removeItem('supabase.auth.token.web');

  // Clear PWA OAuth tracking flags
  localStorage.removeItem('pwa_oauth_initiated');
  localStorage.removeItem('pwa_oauth_provider');
  localStorage.removeItem('pwa_oauth_timestamp');

  // Clear any session-related sessionStorage
  sessionStorage.clear();
};
