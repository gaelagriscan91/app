import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import api, { apiErrorMessage, setOnSignedOut } from "@/src/api/client";
import { tokenStore } from "@/src/api/tokenStore";

export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  blocked?: boolean;
  trial_ends_at?: string | null;
  trial_used?: boolean;
};

type AuthResult = { ok: boolean; error?: string };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  blocked: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (name: string, email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      setBlocked(!!data?.blocked);
    } catch {
      setUser(null);
      setBlocked(false);
    }
  }, []);

  useEffect(() => {
    setOnSignedOut(() => {
      setUser(null);
      setBlocked(false);
    });
    (async () => {
      const token = await tokenStore.getAccess();
      if (token) await fetchMe();
      setLoading(false);
    })();
    return () => setOnSignedOut(null);
  }, [fetchMe]);

  const login = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const { data } = await api.post("/auth/login", { email: email.trim(), password });
      await tokenStore.save(data.access_token, data.refresh_token);
      setUser(data);
      setBlocked(!!data?.blocked);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: apiErrorMessage(e, "No se pudo iniciar sesión") };
    }
  };

  const register = async (name: string, email: string, password: string): Promise<AuthResult> => {
    try {
      const { data } = await api.post("/auth/register", { name: name.trim(), email: email.trim(), password });
      await tokenStore.save(data.access_token, data.refresh_token);
      setUser(data);
      setBlocked(!!data?.blocked);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: apiErrorMessage(e, "No se pudo crear la cuenta") };
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    await tokenStore.clear();
    setUser(null);
    setBlocked(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, blocked, isAdmin: user?.role === "admin", login, register, logout, refreshMe: fetchMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
