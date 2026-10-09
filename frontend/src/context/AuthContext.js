import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      setBlocked(!!data?.blocked);
      return !data?.blocked;
    } catch (e) {
      setUser(null);
      setBlocked(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
    const onBlocked = () => { setBlocked(true); setPaywallOpen(true); };
    window.addEventListener("agriscan:blocked", onBlocked);
    return () => window.removeEventListener("agriscan:blocked", onBlocked);
  }, [fetchMe]);

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setUser(data);
      setBlocked(!!data?.blocked);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const forgotPassword = async (email) => {
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      return { ok: true, message: data?.message || "" };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const resetPassword = async (token, password) => {
    try {
      await api.post("/auth/reset-password", { token, password });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const register = async (name, email, password) => {
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      setUser(data);
      setBlocked(!!data?.blocked);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiErrorDetail(e.response?.data?.detail) || e.message };
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (_) {}
    setUser(null);
    setBlocked(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, blocked, paywallOpen, setPaywallOpen, login, register, logout, refresh: fetchMe, forgotPassword, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
