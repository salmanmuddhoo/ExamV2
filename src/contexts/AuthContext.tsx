import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, clearAllAuthStorage } from '../lib/supabase';

interface Profile {
  id: string;
  email: string;
  role: 'admin' | 'student';
  first_name?: string;
  last_name?: string;
  profile_picture_url?: string;
}

export type OAuthProvider = 'google' | 'azure' | 'facebook';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, firstName: string, lastName: string, role?: 'admin' | 'student') => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set a maximum timeout for initial loading to prevent infinite spinner
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 10000); // 10 second timeout

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[Auth] Session error:', error);
        setUser(null);
        setProfile(null);
        setLoading(false);
        clearTimeout(loadingTimeout);
        return;
      }

      console.log('[Auth] Initial session:', session ? 'Found' : 'None');
      if (session) {
        console.log('[Auth] User:', session.user.email);
      }

      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          clearTimeout(loadingTimeout);
        });
      } else {
        setLoading(false);
        clearTimeout(loadingTimeout);
      }
    }).catch((err) => {
      console.error('[Auth] Session fetch error:', err);
      setUser(null);
      setProfile(null);
      setLoading(false);
      clearTimeout(loadingTimeout);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log(`[Auth] State change: ${_event}`);

      // CRITICAL: Handle OAuth callback from PWA
      // If OAuth was initiated from PWA but callback landed in browser, redirect to PWA
      if (_event === 'SIGNED_IN' && session?.user) {
        const oauthInitiatedFromPWA = localStorage.getItem('pwa_oauth_initiated') === 'true';
        const currentlyInPWA = window.matchMedia('(display-mode: standalone)').matches ||
                               (window.navigator as any).standalone ||
                               document.referrer.includes('android-app://');

        console.log('[Auth] OAuth callback check - Initiated from PWA:', oauthInitiatedFromPWA, 'Currently in PWA:', currentlyInPWA);

        if (oauthInitiatedFromPWA && !currentlyInPWA) {
          console.log('[Auth] OAuth completed in browser but was initiated from PWA - attempting to return to PWA');
          // Clear the flag
          localStorage.removeItem('pwa_oauth_initiated');
          localStorage.removeItem('pwa_oauth_provider');
          localStorage.removeItem('pwa_oauth_timestamp');

          // Try to open the PWA - this will work if PWA is installed
          // The PWA will pick up the session from shared localStorage
          console.log('[Auth] Attempting to reopen PWA...');
          // Give a moment for session to be fully stored
          setTimeout(() => {
            window.close(); // Close the browser window
            // If window doesn't close (blocked), show message
            setTimeout(() => {
              alert('Login successful! Please return to the app.');
            }, 100);
          }, 500);
        } else if (oauthInitiatedFromPWA && currentlyInPWA) {
          console.log('[Auth] OAuth completed in PWA successfully');
          localStorage.removeItem('pwa_oauth_initiated');
          localStorage.removeItem('pwa_oauth_provider');
          localStorage.removeItem('pwa_oauth_timestamp');
        }
      }

      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    // PWA: Listen for when app regains focus to check for new sessions
    // This handles the case where user logs in via browser and returns to PWA
    const handleVisibilityChange = () => {
      const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                    (window.navigator as any).standalone ||
                    document.referrer.includes('android-app://');

      if (isPWA && !document.hidden) {
        console.log('[Auth] PWA regained focus - checking for session updates');
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session && !user) {
            console.log('[Auth] Found new session after PWA regained focus');
            setUser(session.user);
            fetchProfile(session.user.id);
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      clearTimeout(loadingTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [user]);

  const fetchProfile = async (userId: string) => {
    // Create a timeout promise to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Profile fetch timeout')), 8000); // 8 second timeout
    });

    try {
      // Race between the actual fetch and timeout
      const fetchPromise = (async () => {
        let { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          // Check if it's an auth error (expired session)
          if (error.message?.includes('JWT') || error.message?.includes('expired') || error.code === 'PGRST301') {
            await supabase.auth.signOut();
            setUser(null);
            setProfile(null);
            return;
          }
          throw error;
        }

        // If profile doesn't exist (e.g., OAuth user), create it
        if (!data) {
          const { data: { user }, error: userError } = await supabase.auth.getUser();

          if (userError) {
            // Session is invalid
            await supabase.auth.signOut();
            setUser(null);
            setProfile(null);
            return;
          }

          if (user) {
            const { data: newProfile, error: insertError } = await supabase
              .from('profiles')
              .insert({
                id: userId,
                email: user.email,
                role: 'student',
                first_name: user.user_metadata?.full_name?.split(' ')[0] || user.user_metadata?.name?.split(' ')[0] || '',
                last_name: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || user.user_metadata?.name?.split(' ').slice(1).join(' ') || '',
                profile_picture_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                is_active: true
              })
              .select()
              .single();

            if (insertError) throw insertError;
            data = newProfile;
          }
        }

        setProfile(data);
      })();

      await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error: any) {
      if (error.message === 'Profile fetch timeout') {
        // Clear the session on timeout as it's likely invalid
        await supabase.auth.signOut().catch(() => {});
        setUser(null);
        setProfile(null);
      } else {
      }
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string, role: 'admin' | 'student' = 'student') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          role: role,
        },
      },
    });

    if (error) throw error;

    if (data.user) {
      // Wait a bit for the trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 500));

      // Try to upsert the profile to ensure first_name and last_name are set
      // If this fails due to RLS (user not verified yet), the trigger should have already set it
      try {
        await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            email: data.user.email,
            role,
            first_name: firstName,
            last_name: lastName,
            is_active: true
          }, {
            onConflict: 'id'
          });

        // Try to fetch the profile (may fail if email verification is required)
        await fetchProfile(data.user.id);
      } catch (profileError) {
        // If profile operations fail, it's likely because email verification is required
        // This is fine - the trigger should have created the profile with first_name and last_name from metadata
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signInWithOAuth = async (provider: OAuthProvider) => {
    // Detect if running as PWA (installed on device)
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  (window.navigator as any).standalone ||
                  document.referrer.includes('android-app://');

    console.log(`[OAuth] Starting ${provider} OAuth in ${isPWA ? 'PWA' : 'Browser'} mode`);

    // CRITICAL FIX: Don't clear storage key before OAuth!
    // Supabase needs the storage location to save the OAuth callback session
    // Just clear OAuth tracking flags
    try {
      // Clear OAuth tracking flags to start fresh
      localStorage.removeItem('pwa_oauth_initiated');
      localStorage.removeItem('pwa_oauth_provider');
      localStorage.removeItem('pwa_oauth_timestamp');

      console.log('[OAuth] Ready for OAuth - Supabase will handle session replacement');
    } catch (e) {
      console.warn('[OAuth] Error during pre-OAuth cleanup:', e);
    }

    // Configure provider-specific scopes and options
    const options: any = {
      redirectTo: `${window.location.origin}`,
      skipBrowserRedirect: false,
    };

    // Microsoft Azure requires explicit email scope
    if (provider === 'azure') {
      options.scopes = 'openid profile email';
      // Add prompt to force account selection for Microsoft
      options.queryParams = {
        prompt: 'select_account', // Forces account selection
      };
    }

    // Google - ensure we prompt for account selection to handle multiple accounts
    if (provider === 'google') {
      options.queryParams = {
        access_type: 'offline',
        prompt: 'select_account', // Forces account selection every time
      };
    }

    // In PWA mode, use localStorage for OAuth tracking
    if (isPWA) {
      localStorage.setItem('pwa_oauth_initiated', 'true');
      localStorage.setItem('pwa_oauth_provider', provider);
      localStorage.setItem('pwa_oauth_timestamp', Date.now().toString());
    }

    console.log('[OAuth] Calling Supabase signInWithOAuth with options:', options);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options,
    });

    console.log('[OAuth] Supabase response - data:', data);
    console.log('[OAuth] Supabase response - error:', error);

    if (error) {
      console.error('[OAuth] Error:', error);
      throw error;
    }

    console.log('[OAuth] No error - redirect URL should be:', data?.url);

    // CRITICAL FIX: Manually redirect to OAuth provider
    // For PWA: Navigate in the same window to keep OAuth flow within PWA
    // For Browser: Same behavior
    if (data?.url) {
      if (isPWA) {
        console.log('[OAuth] PWA: Navigating to OAuth in same window to preserve PWA context');
        console.log('[OAuth] Redirecting to:', data.url);
        // Force same-window navigation in PWA to ensure callback returns to PWA
        window.location.assign(data.url);
      } else {
        console.log('[OAuth] Browser: Redirecting to:', data.url);
        window.location.href = data.url;
      }
    } else {
      console.error('[OAuth] No URL provided by Supabase - cannot redirect');
      throw new Error('OAuth redirect URL not provided');
    }
  };

  const signOut = async () => {
    try {
      console.log('[Auth] Signing out...');

      // Clear UI state first
      setUser(null);
      setProfile(null);

      // Sign out from Supabase (this clears the auth token)
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[Auth] Supabase signOut error:', error);
        throw error;
      }

      // Clear session storage (view state, OAuth flags, etc.)
      sessionStorage.clear();

      // Clear OAuth tracking flags from localStorage
      localStorage.removeItem('pwa_oauth_initiated');
      localStorage.removeItem('pwa_oauth_provider');
      localStorage.removeItem('pwa_oauth_timestamp');

      console.log('[Auth] Sign out complete');
    } catch (error) {
      console.error('[Auth] Error during sign out:', error);
      // Even if signOut fails, clear local state
      setUser(null);
      setProfile(null);
      sessionStorage.clear();
      throw error;
    }
  };

  const value = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signInWithOAuth,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
