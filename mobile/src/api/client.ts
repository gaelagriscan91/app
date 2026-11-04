import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { tokenStore } from "./tokenStore";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
  headers: { Accept: "application/json" },
});

let refreshPromise: Promise<string> | null = null;
let onSignedOut: (() => void) | null = null;
export function setOnSignedOut(cb: (() => void) | null) {
  onSignedOut = cb;
}

type RetryConfig = InternalAxiosRequestConfig & { _authRetry?: boolean };

async function refreshAccessToken(): Promise<string> {
  const refresh_token = await tokenStore.getRefresh();
  if (!refresh_token) throw new Error("No refresh token");
  const { data } = await axios.post(
    `${API_BASE}/auth/refresh`,
    { refresh_token },
    { timeout: 20000 },
  );
  if (!data?.access_token || !data?.refresh_token) throw new Error("Invalid refresh response");
  await tokenStore.save(data.access_token, data.refresh_token);
  return data.access_token;
}

api.interceptors.request.use(async (config) => {
  const access = await tokenStore.getAccess();
  if (access) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    const url = original?.url || "";
    if (
      error.response?.status !== 401 ||
      !original ||
      original._authRetry ||
      /\/auth\/(login|refresh|register|logout)/.test(url)
    ) {
      throw error;
    }
    original._authRetry = true;
    try {
      refreshPromise = refreshPromise ?? refreshAccessToken().finally(() => { refreshPromise = null; });
      const access = await refreshPromise;
      original.headers = original.headers ?? {};
      original.headers.Authorization = `Bearer ${access}`;
      return api(original);
    } catch (refreshError) {
      await tokenStore.clear();
      onSignedOut?.();
      throw refreshError;
    }
  },
);

export function apiErrorMessage(e: any, fallback = "Ocurrió un error. Intenta de nuevo."): string {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d: any) => d?.msg || "").filter(Boolean).join(" ") || fallback;
  if (detail?.msg) return detail.msg;
  return fallback;
}

export default api;
