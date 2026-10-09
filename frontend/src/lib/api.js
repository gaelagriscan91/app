import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Blocked/expired accounts: tell the app to show the blocked screen
const isBlockedError = (e) =>
  e?.response?.status === 403 && /bloquead|vencido/i.test(String(e?.response?.data?.detail || ""));
export { isBlockedError };

// Sliding session: on 401 try one refresh (rotates the 30-day cookie) and retry
let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error.config || {};
    const url = cfg.url || "";
    if (isBlockedError(error)) {
      window.dispatchEvent(new Event("agriscan:blocked"));
      return Promise.reject(error);
    }
    if (error.response?.status === 401 && !cfg._retried && !/\/auth\/(login|refresh|register|logout)/.test(url)) {
      cfg._retried = true;
      try {
        refreshing = refreshing || api.post("/auth/refresh").finally(() => { refreshing = null; });
        await refreshing;
        return api(cfg);
      } catch (_) {}
    }
    return Promise.reject(error);
  }
);

export default api;

// Check-in session values (Block/Variedad/Mayordomo) for a date, used as receipt-export fallbacks
export function sessionExportParams(date) {
  try {
    const s = JSON.parse(localStorage.getItem(`agriscan.session.${date}`) || "{}");
    return {
      rancho: s.ranchoName || undefined,
      trabajo: s.trabajoName || undefined,
      block: s.block || undefined,
      variety: s.variedad || undefined,
      mayordomo: s.mayordomo || undefined,
      price: (s.unitMode === "horas" ? s.pricePerHour : s.pricePerUnit) || undefined,
    };
  } catch {
    return {};
  }
}

// Check-in session (Rancho/Block/Trabajo/Variedad/Precio) persisted on the server until history reset
export async function fetchCheckinSession(date) {
  const key = `agriscan.session.${date}`;
  let local = {};
  try { local = JSON.parse(localStorage.getItem(key) || "{}"); } catch { local = {}; }
  try {
    const { data } = await api.get("/checkin-session");
    if (data && Object.keys(data).length) {
      try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
      return data;
    }
    if (Object.keys(local).length) api.put("/checkin-session", local).catch(() => {});
  } catch {}
  return local;
}

export function saveCheckinSession(data) {
  return api.put("/checkin-session", data).catch(() => {});
}

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Ocurrió un error. Intenta de nuevo.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function formatCurrency(n) {
  const v = Number(n || 0);
  return v.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatNumber(n, decimals = 2) {
  const v = Number(n || 0);
  return v.toLocaleString("es-MX", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Format an ISO timestamp as HH:MM in the user's local timezone.
 * Backend stores times in UTC; this converts to local for display.
 */
export function formatHHMM(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch (_) {
    return "";
  }
}
