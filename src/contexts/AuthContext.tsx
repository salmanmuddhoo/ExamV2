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
  signUp: (email: string, password: string, firstName: string, lastName: string, role?: 'admin' | 'student') => Promise<{user: User | null}>;
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

    const initAuth = async () => {
      // Supabase automatically detects and processes OAuth codes via detectSessionInUrl: true
      // No manual exchange needed - just check for existing session
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        clearTimeout(loadingTimeout);
        return;
      }

      if (session) {
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
    };

    initAuth().catch((err) => {
      setUser(null);
      setProfile(null);
      setLoading(false);
      clearTimeout(loadingTimeout);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {

      // CRITICAL: Handle OAuth callback from PWA
      // If OAuth was initiated from PWA but callback landed in browser, redirect to PWA
      if (_event === 'SIGNED_IN' && session?.user) {
        const oauthInitiatedFromPWA = localStorage.getItem('pwa_oauth_initiated') === 'true';
        const currentlyInPWA = window.matchMedia('(display-mode: standalone)').matches ||
                               (window.navigator as any).standalone ||
                               document.referrer.includes('android-app://');


        if (oauthInitiatedFromPWA && !currentlyInPWA) {
          // Clear the flag
          localStorage.removeItem('pwa_oauth_initiated');
          localStorage.removeItem('pwa_oauth_provider');
          localStorage.removeItem('pwa_oauth_timestamp');

          // Try to open the PWA - this will work if PWA is installed
          // The PWA will pick up the session from shared localStorage
          // Give a moment for session to be fully stored
          setTimeout(() => {
            window.close(); // Close the browser window
            // If window doesn't close (blocked), show message
            setTimeout(() => {
              alert('Login successful! Please return to the app.');
            }, 100);
          }, 500);
        } else if (oauthInitiatedFromPWA && currentlyInPWA) {
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

    return () => {
      subscription.unsubscribe();
      clearTimeout(loadingTimeout);
    };
  }, []); // CRITICAL: Empty dependency array to prevent re-running on user changes

  // Separate effect for PWA session detection to avoid recreating auth listeners
  useEffect(() => {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  (window.navigator as any).standalone ||
                  document.referrer.includes('android-app://');

    if (!isPWA) return; // Only set up for PWA


    // Listen for localStorage changes (when browser completes OAuth, PWA will detect it)
    const handleStorageChange = (e: StorageEvent) => {

      // Check if auth token was added/changed
      if (e.key === 'supabase.auth.token' && e.newValue && !user) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session && !user) {
            setUser(session.user);
            fetchProfile(session.user.id);
          }
        });
      }
    };

    // Listen for visibility changes (when user switches back to PWA)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Force fresh session check
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session && !user) {
            setUser(session.user);
            fetchProfile(session.user.id);
          } else if (!session && user) {
            setUser(null);
            setProfile(null);
          }
        });
      }
    };

    // Poll for session changes every 2 seconds when PWA is visible
    // This catches cases where storage events don't fire (same-window changes)
    const pollInterval = setInterval(() => {
      if (!document.hidden) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session && !user) {
            setUser(session.user);
            fetchProfile(session.user.id);
          } else if (!session && user) {
            setUser(null);
            setProfile(null);
          }
        });
      }
    }, 2000);

    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      clearInterval(pollInterval);
    };
  }, [user]); // Only user dependency for visibility checks

  const fetchProfile = async (userId: string) => {
    // Create a timeout promise to prevent hanging
    // Increased to 15 seconds for new OAuth users where profile creation might be slow
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Profile fetch timeout')), 15000);
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

            if (insertError) {
              throw insertError;
            }
            data = newProfile;
          }
        }

        setProfile(data);
      })();

      await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error: any) {
      if (error.message === 'Profile fetch timeout') {
        // CHANGED: Don't sign out on timeout - just log error
        // The session might be valid, just the profile fetch is slow
        setProfile(null);
      } else {
      }
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string, role: 'admin' | 'student' = 'student') => {
    const { data, error} = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/email-verification`,
        data: {
          first_name: firstName,
          last_name: lastName,
          role: role,
        },
      },
    });

    if (error) throw error;

    // Return the user data so referral code can be applied in LoginForm
    return data;
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


    // CRITICAL FIX: Don't clear storage key before OAuth!
    // Supabase needs the storage location to save the OAuth callback session
    // Just clear OAuth tracking flags
    try {
      // Clear OAuth tracking flags to start fresh
      localStorage.removeItem('pwa_oauth_initiated');
      localStorage.removeItem('pwa_oauth_provider');
      localStorage.removeItem('pwa_oauth_timestamp');

    } catch (e) {
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


    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options,
    });


    if (error) {
      throw error;
    }


    // CRITICAL FIX: Manually redirect to OAuth provider
    // For PWA: Navigate in the same window to keep OAuth flow within PWA
    // For Browser: Same behavior
    if (data?.url) {
      if (isPWA) {
        // Force same-window navigation in PWA to ensure callback returns to PWA
        window.location.assign(data.url);
      } else {
        window.location.href = data.url;
      }
    } else {
      throw new Error('OAuth redirect URL not provided');
    }
  };

  const signOut = async () => {
    try {

      // Clear UI state first
      setUser(null);
      setProfile(null);

      // Sign out from Supabase (this clears the auth token)
      const { error } = await supabase.auth.signOut();
      if (error) {
      }

      // CRITICAL: Clear ALL auth-related storage including PKCE verifiers
      // This prevents leftover storage from blocking subsequent logins
      clearAllAuthStorage();

      // Additional cleanup: Clear any Supabase PKCE code verifiers
      // These are stored with pattern like 'sb-xxx-auth-token-code-verifier'
      const storageKeys = Object.keys(localStorage);
      storageKeys.forEach(key => {
        if (key.includes('supabase') || key.includes('sb-') || key.includes('auth-token') || key.includes('code-verifier')) {
          localStorage.removeItem(key);
        }
      });

      // Clear all sessionStorage
      sessionStorage.clear();

    } catch (error) {
      // Even if signOut fails, clear local state and storage
      setUser(null);
      setProfile(null);
      clearAllAuthStorage();
      sessionStorage.clear();
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
