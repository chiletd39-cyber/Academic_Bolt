import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

// Session keep-alive interval (ms) — refreshes token every 4 minutes
const SESSION_KEEPALIVE_MS = 4 * 60 * 1000;

type UserRole = 'student' | 'teacher' | 'admin' | 'parent';

interface UserProfile {
  id: string;
  user_id: string;
  role: UserRole;
  full_name: string;
  phone?: string;
  student_card?: string;
  current_class?: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole | null;
  signUp: (email: string, password: string, profileData: Partial<UserProfile> & { admin_code?: string }) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  
  signOut: () => Promise<void>;
  verifyAdminCode: (code: string) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: Error | null }>;
  uploadAvatar: (file: File) => Promise<{ url: string | null; error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const profileCache = useRef<Record<string, UserProfile>>({});
  const fetchingRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string, force = false) => {
    if (fetchingRef.current === userId && !force) return profileCache.current[userId] || null;
    if (!force && profileCache.current[userId]) {
      setProfile(profileCache.current[userId]);
      return profileCache.current[userId];
    }

    fetchingRef.current = userId;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      fetchingRef.current = null;
      
      if (data && !error) {
        profileCache.current[userId] = data as UserProfile;
        setProfile(data as UserProfile);
      }
      return data;
    } catch (err) {
      fetchingRef.current = null;
      console.error('Profile fetch failed (network):', err);
      // Return cached on network failure — do NOT sign out
      if (profileCache.current[userId]) {
        setProfile(profileCache.current[userId]);
        return profileCache.current[userId];
      }
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id, true);
    }
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    let isMounted = true;
    const initialLoadDoneRef = { current: false };
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        if (!isMounted) return;
        if (event === 'INITIAL_SESSION') return;
        if (!initialLoadDoneRef.current) return;

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
          return;
        }

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          setTimeout(() => {
            if (isMounted) fetchProfile(currentSession.user.id);
          }, 0);
        }
      }
    );

    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          await fetchProfile(currentSession.user.id);

          // Start keep-alive: silently refresh session every 4 min
          keepAliveTimer = setInterval(async () => {
            try {
              const { data, error } = await supabase.auth.refreshSession();
              if (!error && data.session && isMounted) {
                setSession(data.session);
                setUser(data.session.user);
              }
              // On error, do NOT sign out — token may still be valid
            } catch {
              // Network blip — silently ignore, keep existing session
            }
          }, SESSION_KEEPALIVE_MS);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        if (isMounted) {
          initialLoadDoneRef.current = true;
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      if (keepAliveTimer) clearInterval(keepAliveTimer);
    };
  }, [fetchProfile]);

  const signUp = useCallback(async (email: string, password: string, profileData: Partial<UserProfile> & { admin_code?: string }) => {
    const redirectUrl = `${window.location.origin}/dashboard`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) return { error };

    if (data.user) {
      // Use secure RPC for profile creation - validates role server-side
      const { error: profileError } = await supabase.rpc('create_profile_with_role', {
        _user_id: data.user.id,
        _role: profileData.role || 'student',
        _full_name: profileData.full_name || '',
        _phone: profileData.phone || null,
        _student_card: profileData.student_card || null,
        _current_class: profileData.current_class || null,
        _admin_code: profileData.admin_code || null,
      });

      if (profileError) return { error: new Error(profileError.message) };
    }

    return { error: null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error ? new Error(error.message) : null };
  }, []);


  const signOut = useCallback(async () => {
    profileCache.current = {};
    setProfile(null);
    setSession(null);
    setUser(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors during sign-out
    }
  }, []);

  const verifyAdminCode = useCallback(async (code: string) => {
    const { data, error } = await supabase.rpc('verify_admin_code', { input_code: code });
    if (error) {
      // Surface real reason (rate-limit etc.) instead of silently returning false
      console.error('Admin code verification error:', error);
      throw new Error(error.message || 'Admin code verification failed');
    }
    return !!data;
  }, []);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!user?.id) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: updates.full_name,
        phone: updates.phone,
        current_class: updates.current_class,
        avatar_url: updates.avatar_url,
      })
      .eq('user_id', user.id);

    if (!error) {
      await refreshProfile();
    }

    return { error: error ? new Error(error.message) : null };
  }, [user?.id, refreshProfile]);

  const uploadAvatar = useCallback(async (file: File) => {
    if (!user?.id) return { url: null, error: new Error('Not authenticated') };

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      return { url: null, error: new Error(uploadError.message) };
    }

    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    return { url: urlData.publicUrl, error: null };
  }, [user?.id]);

  const value = useMemo(() => ({
    user,
    session,
    profile,
    isAuthenticated: !!session,
    isLoading,
    role: profile?.role || null,
    signUp,
    signIn,
    signOut,
    verifyAdminCode,
    refreshProfile,
    updateProfile,
    uploadAvatar,
  }), [user, session, profile, isLoading, signUp, signIn, signOut, verifyAdminCode, refreshProfile, updateProfile, uploadAvatar]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
