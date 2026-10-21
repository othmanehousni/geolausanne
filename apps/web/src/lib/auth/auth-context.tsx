"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getRepository } from "@/lib/data";
import type { AuthUser, OAuthProvider } from "@/lib/data/repository";
import type { Profile } from "@/lib/data/types";

interface AuthState {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  isModerator: boolean;
  providers: OAuthProvider[];
  demo: boolean;
  signInWithEmail(email: string, redirectTo: string, captchaToken?: string): Promise<{ instant: boolean }>;
  signInWithOAuth(provider: OAuthProvider, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const repo = getRepository();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await repo.auth.profile());
    } catch {
      setProfile(null);
    }
  }, [repo]);

  useEffect(() => {
    let alive = true;
    repo.auth
      .getUser()
      .then(async (u) => {
        if (!alive) return;
        setUser(u);
        if (u) await refreshProfile();
      })
      .finally(() => alive && setLoading(false));
    const off = repo.auth.onChange(async (u) => {
      setUser(u);
      if (u) await refreshProfile();
      else setProfile(null);
      // votes and "is mine" flags depend on who is signed in
      void queryClient.invalidateQueries();
    });
    return () => {
      alive = false;
      off();
    };
  }, [repo, refreshProfile, queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      loading,
      isModerator: profile?.role === "moderator" || profile?.role === "admin",
      providers: repo.auth.providers,
      demo: repo.mode === "demo",
      signInWithEmail: (email, redirectTo, captchaToken) => repo.auth.signInWithEmail(email, redirectTo, captchaToken),
      signInWithOAuth: (provider, redirectTo) => repo.auth.signInWithOAuth(provider, redirectTo),
      signOut: () => repo.auth.signOut(),
      refreshProfile,
    }),
    [user, profile, loading, repo, refreshProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
