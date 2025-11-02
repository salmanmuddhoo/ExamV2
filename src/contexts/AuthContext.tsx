import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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
        setUser(null);
        setProfile(null);
        setLoading(false);
        clearTimeout(loadingTimeout);
        return;
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
      setUser(null);
      setProfile(null);
      setLoading(false);
      clearTimeout(loadingTimeout);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (() => {
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      })();
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(loadingTimeout);
    };
  }, []);

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
    // Configure provider-specific scopes and options
    const options: any = {
      redirectTo: `${window.location.origin}`,
    };

    // Microsoft Azure requires explicit email scope
    if (provider === 'azure') {
      options.scopes = 'openid profile email';
    }

    // Google - ensure we prompt for account selection to handle multiple accounts
    if (provider === 'google') {
      options.queryParams = {
        access_type: 'offline',
        prompt: 'select_account', // Forces account selection every time
      };
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options,
    });

    if (error) throw error;
  };

  const signOut = async () => {
    try {
      // Clear session storage on logout (including welcome modal flag)
      sessionStorage.clear();

      setUser(null);
      setProfile(null);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setUser(null);
      setProfile(null);
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
