export function formatCurrency(n: number | string | null | undefined): string {
  const v = Number(n || 0);
  return v.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatNumber(n: number | string | null | undefined, decimals = 2): string {
  const v = Number(n || 0);
  return v.toLocaleString("es-MX", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtQty(n: number): string {
  const v = Number(n || 0);
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  return todayISOFrom(d);
}

function todayISOFrom(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatHHMM(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

export function formatHours(h?: number | null): string {
  if (!h) return "0min";
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return hh > 0 ? `${hh}h ${mm}min` : `${mm}min`;
}

export function fmtStamp(h: { created_at?: string; date?: string }): string {
  const d = h.created_at ? new Date(h.created_at) : null;
  if (!d || isNaN(d.getTime())) return h.date || "";
  return `${d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" })} · ${d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

const TIPO: Record<string, string> = { pieza: "Pieza", libra: "Libra", horas: "Horas" };
export function unitOf(h: { unit_type?: string; price_mode?: string }): string {
  return (TIPO[h.unit_type || ""] || (h.price_mode === "hour" ? "Horas" : "Pieza")).toLowerCase();
}
export { TIPO };
