import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2, Plus, ScanLine, Moon, RefreshCw, Cloud,
  SlidersHorizontal, Search, Trash2, LogOut,
} from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, formatNumber, todayISO } from "@/lib/api";

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [search, setSearch] = useState("");
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [applyingFrac, setApplyingFrac] = useState(null);
  const [savedAt, setSavedAt] = useState(() => {
    try { return localStorage.getItem("agriscan.lastSavedAt") || ""; } catch (_) { return ""; }
  });
  const [savedIds, setSavedIds] = useState(() => {
    try {
      const today = todayISO();
      const raw = JSON.parse(localStorage.getItem("agriscan.savedIds") || "{}");
      return new Set(raw[today] || []);
    } catch (_) { return new Set(); }
  });

  const load = async () => {
    try {
      const { data } = await api.get("/dashboard");
      setData(data);
    } catch (_) { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Show save prompt sheet when the scanner returns with ?prompt=save
  useEffect(() => {
    if (searchParams.get("prompt") === "save") {
      setShowSavePrompt(true);
      const next = new URLSearchParams(searchParams);
      next.delete("prompt");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const deleteHarvest = async (id, workerName) => {
    if (!window.confirm(`¿Borrar las piezas de ${workerName}?`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/harvests/${id}`);
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith("agriscan.scanlog.")) continue;
          const raw = JSON.parse(localStorage.getItem(key) || "[]");
          const next = raw.filter((e) => e.harvestId !== id);
          if (next.length !== raw.length) localStorage.setItem(key, JSON.stringify(next));
        }
      } catch (_) { /* ignore */ }
      toast.success("Piezas eliminadas");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo eliminar");
    } finally { setDeletingId(""); }
  };

  const rows = useMemo(() => {
    const today = todayISO();
    // Only show today's scans that have been SAVEd at least once
    const list = (data?.month_records || []).filter((r) => {
      if (r.pending) return false;
      if (r.date !== today) return false;
      return savedIds.has(r.id);
    });
    const q = (search || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => (r.worker_name || "").toLowerCase().includes(q));
  }, [data, search, savedIds]);

  const todayCount = useMemo(() => {
    const today = todayISO();
    return (data?.month_records || []).filter((r) => r.date === today && !r.pending).length;
  }, [data]);

  const activeWorkers = useMemo(() => {
    const today = todayISO();
    const set = new Set();
    (data?.month_records || []).forEach((r) => {
      if (!r.pending && r.date === today && r.worker_id) set.add(r.worker_id);
    });
    return set.size;
  }, [data]);

  const lastEntry = useMemo(() => {
    const nonPending = (data?.month_records || []).filter((r) => !r.pending);
    return nonPending[0] || null;
  }, [data]);

  // Apply fraction (1/4, 1/2, 3/4) to the LAST scanned harvest — replaces its units value
  const applyFractionToLast = async (frac) => {
    if (!lastEntry) { toast.error("Escanea primero a un trabajador"); return; }
    setApplyingFrac(frac);
    try {
      await api.put(`/harvests/${lastEntry.id}`, {
        worker_id: lastEntry.worker_id,
        parcel_id: lastEntry.parcel_id,
        product_id: lastEntry.product_id,
        kilos: 0,
        units: frac,
        price_per_kg: lastEntry.price_per_kg || 0,
        price_per_unit: lastEntry.price_per_unit || 0,
        date: lastEntry.date,
      });
      toast.success(`${lastEntry.worker_name}: ${frac === 0.25 ? "1/4" : frac === 0.5 ? "1/2" : "3/4"}`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo aplicar la fracción");
    } finally {
      setApplyingFrac(null);
    }
  };

  // SAVE — snapshot today's receipts into history AND mark local scans as visible
  const saveReceipt = async () => {
    const today = todayISO();
    setSavingReceipt(true);
    // Refresh data first so we snapshot the latest harvests
    let latest = data;
    try {
      const resp = await api.get("/dashboard");
      latest = resp.data;
      setData(latest);
    } catch (_) { /* fallback to current data */ }

    const todayIds = (latest?.month_records || [])
      .filter((r) => !r.pending && r.date === today)
      .map((r) => r.id);

    // Flag local savedIds so records show in Inicio
    const nextSet = new Set(savedIds);
    todayIds.forEach((id) => nextSet.add(id));
    setSavedIds(nextSet);
    try {
      const raw = JSON.parse(localStorage.getItem("agriscan.savedIds") || "{}");
      raw[today] = Array.from(nextSet);
      localStorage.setItem("agriscan.savedIds", JSON.stringify(raw));
    } catch (_) {}

    // Snapshot receipt in backend (idempotent — may already exist, that's OK)
    try {
      await api.post("/receipts/history", { date_from: today, date_to: today });
    } catch (_) { /* ignore */ }

    const now = new Date().toISOString();
    try { localStorage.setItem("agriscan.lastSavedAt", now); } catch (_) {}
    setSavedAt(now);
    setShowSavePrompt(false);
    toast.success(todayIds.length ? "Registro guardado" : "Guardado");
    setSavingReceipt(false);
  };

  // Show the action bar only when there's a NEW scan since last SAVE
  const hasUnsavedScan = useMemo(() => {
    if (!lastEntry) return false;
    const scanAt = lastEntry.created_at || "";
    if (!savedAt) return true;
    return scanAt > savedAt;
  }, [lastEntry, savedAt]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-104px)] -mx-4 -my-5 sm:-my-7 bg-[#1A1A1A] flex items-center justify-center text-white">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#1A1A1A] text-white -mx-4 -my-5 sm:-my-7 min-h-[calc(100vh-104px)] flex flex-col pb-28" data-testid="dashboard-page">
      {/* Cloud sync status */}
      <div className="flex items-center justify-end px-4 pt-3">
        <div className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center text-emerald-400" title="Sincronizado">
          <Cloud className="w-4 h-4" />
        </div>
      </div>

      {/* Search + filter */}
      <div className="px-4 pt-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar trabajador…"
            className="w-full h-10 bg-[#262626] border border-[#333] rounded-xl pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#1D4ED8]"
            data-testid="home-search-input"
          />
        </div>
        <button
          onClick={() => navigate("/reportes")}
          className="w-10 h-10 rounded-xl bg-[#262626] border border-[#333] flex items-center justify-center text-gray-300 hover:bg-[#333]"
          data-testid="home-filter-button"
          title="Reportes"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Icon toolbar: + / camera / moon / refresh */}
      <div className="px-4 pt-3 flex items-center justify-between">
        <button
          onClick={() => navigate("/modulos")}
          className="w-11 h-11 rounded-xl bg-transparent flex items-center justify-center text-white hover:bg-[#262626]"
          data-testid="home-plus-button"
          aria-label="Nuevo trabajador"
        >
          <Plus className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/asistencia?action=checkout")}
            className="w-11 h-11 rounded-xl bg-[#DC2626] flex items-center justify-center text-white shadow"
            data-testid="home-checkout-button"
            aria-label="Check out"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate("/asistencia")}
            className="w-11 h-11 rounded-xl bg-[#5A4A98] flex items-center justify-center text-white shadow"
            data-testid="home-night-button"
            aria-label="Asistencia"
          >
            <Moon className="w-5 h-5" />
          </button>
          <button
            onClick={load}
            className="w-11 h-11 rounded-xl bg-transparent border border-[#333] flex items-center justify-center text-gray-300 hover:bg-[#262626]"
            data-testid="home-refresh-button"
            aria-label="Recargar"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Records list */}
      <div className="px-4 mt-3 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400 font-semibold">
            {search ? "Sin coincidencias" : "Sin registros guardados hoy"}
          </div>
        ) : (
          <ul className="divide-y divide-[#1F1F1F]">
            {rows.map((r) => {
              const dt = new Date(r.date + "T00:00:00");
              const dateLabel = `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
              let timeLabel = "";
              if (r.created_at) {
                try {
                  const d = new Date(r.created_at);
                  timeLabel = d.toLocaleTimeString("es-MX", {
                    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
                  }).toLowerCase();
                } catch (_) {}
              }
              const notes = (r.notes || "").toLowerCase();
              const sourceLabel = notes.includes("manual") || notes.includes("ajuste")
                ? "MANUAL"
                : notes.includes("comparti") || notes.includes("shared")
                ? "GRUPO"
                : "QR";
              const unitWord = (r.unit_label || "pieza").toLowerCase();
              const unitShort = unitWord.startsWith("libra")
                ? "LB"
                : unitWord.startsWith("hora")
                ? "HR"
                : "PZA";
              return (
                <li
                  key={r.id}
                  onClick={() => deleteHarvest(r.id, r.worker_name)}
                  className="py-3 flex items-center justify-between gap-3 cursor-pointer active:bg-[#1a1a1a]"
                  data-testid={`home-record-${r.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-white truncate text-lg leading-tight">
                      {r.worker_name}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400 font-semibold">
                      <span className="px-1.5 py-[1px] rounded bg-rose-900/60 text-rose-300 font-extrabold tracking-wider text-[10px]">
                        {sourceLabel}
                      </span>
                      <span>{dateLabel}</span>
                      {timeLabel && (
                        <>
                          <span className="opacity-50">·</span>
                          <span className="font-mono-stat">{timeLabel}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono-stat text-lg font-extrabold text-sky-400 leading-tight">
                      {formatCurrency(r.payment)}
                    </div>
                    <div className="text-[12px] text-gray-400 font-semibold mt-0.5">
                      <span className="font-mono-stat text-white font-extrabold mr-1">
                        {formatNumber(r.units, r.units % 1 === 0 ? 0 : 2)}
                      </span>
                      /{unitShort}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Bottom action bar — SCAN siempre visible, fracciones + SAVE arriba cuando hay escaneo */}
      <div className="fixed left-0 right-0 bottom-[70px] z-30 pointer-events-none">
        <div className="max-w-5xl mx-auto px-3 pointer-events-auto">
          <div className="bg-[#111] border-t border-[#2A2A2A] rounded-t-2xl px-3 pt-2 pb-3 shadow-2xl">
            {/* Secondary row: fractions + SAVE (only when a scan is pending) */}
            {hasUnsavedScan && (
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className="grid grid-cols-3 gap-1">
                  {[{ f: 0.25, l: "1/4" }, { f: 0.5, l: "1/2" }, { f: 0.75, l: "3/4" }].map(({ f, l }) => (
                    <button
                      key={l}
                      onClick={() => applyFractionToLast(f)}
                      disabled={!lastEntry || applyingFrac !== null}
                      className="h-7 rounded-md bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[10px] font-extrabold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                      data-testid={`home-frac-${l.replace("/", "-")}`}
                    >
                      {applyingFrac === f ? <Loader2 className="w-3 h-3 animate-spin" /> : l}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-end">
                  <button
                    onClick={saveReceipt}
                    disabled={savingReceipt}
                    className="h-7 px-5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold disabled:opacity-50 flex items-center"
                    data-testid="home-save-button"
                  >
                    {savingReceipt ? <Loader2 className="w-3 h-3 animate-spin" /> : "GUARDAR"}
                  </button>
                </div>
              </div>
            )}

            {/* Primary row: Empleado activo | SCAN | Pieza */}
            <div className="grid grid-cols-3 items-center gap-2">
              <div className="text-[13px] font-semibold text-gray-200">
                Empleado activo: <span className="font-extrabold text-white">{activeWorkers}</span>
              </div>
              <div className="flex items-center justify-center">
                <button
                  onClick={() => navigate("/registrar?mode=qr")}
                  className="w-20 h-20 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] active:scale-95 text-white font-extrabold text-base shadow-[0_6px_20px_rgba(220,38,38,0.5)] flex items-center justify-center transition"
                  data-testid="home-scan-button"
                  aria-label="Escanear"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  SCAN
                </button>
              </div>
              <div className="text-right text-[13px] font-semibold text-gray-200">
                Pieza: <span className="font-extrabold text-white">{todayCount}</span>
              </div>
            </div>

            {/* Fallback SAVE button if no fractions row is shown */}
            {!hasUnsavedScan && (
              <div className="flex items-center justify-end mt-2">
                <button
                  onClick={saveReceipt}
                  disabled={savingReceipt}
                  className="h-7 px-5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold disabled:opacity-50 flex items-center"
                  data-testid="home-save-button"
                >
                  {savingReceipt ? <Loader2 className="w-3 h-3 animate-spin" /> : "GUARDAR"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save prompt bottom-sheet — shown after a scan returns via ?prompt=save */}
      {showSavePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSavePrompt(false)}
          data-testid="save-prompt-sheet"
        >
          <div
            className="w-full bg-[#1A1A1A] text-white rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),20px)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto mb-4" />
            <h3 className="text-xl font-extrabold text-center" style={{ fontFamily: "Outfit, sans-serif" }}>
              ¿Guardar recibo?
            </h3>
            {lastEntry && (
              <p className="text-sm text-gray-300 text-center mt-1">
                Último escaneo: <span className="font-bold text-white">{lastEntry.worker_name}</span>
              </p>
            )}
            <div className="mt-5 space-y-2">
              <button
                onClick={saveReceipt}
                disabled={savingReceipt}
                className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold text-lg flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
                data-testid="save-prompt-save-btn"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {savingReceipt ? <Loader2 className="w-5 h-5 animate-spin" /> : "GUARDAR"}
              </button>
              <button
                onClick={() => { setShowSavePrompt(false); navigate("/registrar?mode=qr"); }}
                className="w-full h-12 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center gap-2"
                data-testid="save-prompt-continue-btn"
              >
                Seguir escaneando
              </button>
              <button
                onClick={() => setShowSavePrompt(false)}
                className="w-full h-11 text-gray-400 hover:text-white font-semibold text-sm"
                data-testid="save-prompt-close-btn"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
