import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, Plus, ScanLine, Moon, RefreshCw, Cloud,
  SlidersHorizontal, Search, Trash2, LogOut,
} from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, formatNumber } from "@/lib/api";

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/dashboard");
      setData(data);
    } catch (_) { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

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
    const list = data?.month_records || [];
    const q = (search || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => (r.worker_name || "").toLowerCase().includes(q));
  }, [data, search]);

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (data?.month_records || []).filter((r) => r.date === today && !r.pending).length;
  }, [data]);

  const lastEntry = useMemo(() => {
    const nonPending = (data?.month_records || []).filter((r) => !r.pending);
    return nonPending[0] || null;
  }, [data]);

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
            {search ? "Sin coincidencias" : "Sin registros este mes aún"}
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const dt = new Date(r.date + "T00:00:00");
              const dateLabel = `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
              return (
                <li
                  key={r.id}
                  className={`rounded-xl bg-[#1F1F1F] px-3 py-2.5 flex items-center justify-between gap-3 ${r.pending ? "border border-amber-800/60" : "border border-transparent"}`}
                  data-testid={`home-record-${r.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-white truncate text-base">
                      {r.worker_name}
                      {r.pending && <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">En campo</span>}
                    </div>
                    <div className="text-[11px] text-gray-400 font-semibold mt-0.5">
                      {dateLabel}
                    </div>
                    {!r.pending && (r.parcel_name || r.product_name) && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {r.parcel_name && <span className="text-[10px] font-semibold text-gray-300 bg-[#2A2A2A] px-1.5 py-0.5 rounded">{r.parcel_name}</span>}
                        {r.product_name && <span className="text-[10px] font-semibold text-gray-300 bg-[#2A2A2A] px-1.5 py-0.5 rounded">{r.product_name}</span>}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider leading-none">Pza</div>
                    <div className="font-mono-stat text-base text-white font-extrabold leading-tight">
                      {r.pending ? "0" : formatNumber(r.units, r.units % 1 === 0 ? 0 : 2)}
                    </div>
                  </div>
                  <div className={`font-mono-stat text-base font-extrabold shrink-0 ${r.pending ? "text-gray-500" : "text-white"}`}>
                    {r.pending ? "—" : formatCurrency(r.payment)}
                  </div>
                  {!r.pending && (
                    <button
                      onClick={() => deleteHarvest(r.id, r.worker_name)}
                      disabled={deletingId === r.id}
                      className="w-8 h-8 rounded-lg bg-red-900/40 hover:bg-red-800/60 text-red-400 flex items-center justify-center shrink-0 disabled:opacity-50"
                      data-testid={`home-delete-${r.id}`}
                      title="Borrar"
                    >
                      {deletingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Bottom action bar — Empleados · SCAN · Pieza · last entry */}
      <div className="fixed left-0 right-0 bottom-[70px] z-30 pointer-events-none">
        <div className="max-w-5xl mx-auto px-3 pointer-events-auto">
          <div className="bg-[#111] border-t border-[#2A2A2A] rounded-t-2xl grid grid-cols-3 items-end gap-2 px-3 pt-2 pb-3 shadow-2xl">
            {/* LEFT — Empleados + fraction shortcuts */}
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-gray-300 mb-1">
                Empleados
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[{ f: 0.25, l: "1/4" }, { f: 0.5, l: "1/2" }, { f: 0.75, l: "3/4" }].map(({ f, l }) => (
                  <button
                    key={l}
                    onClick={() => navigate(`/registrar?fraction=${f}`)}
                    className="h-7 rounded-md bg-[#DC2626] hover:bg-[#B91C1C] text-white text-[10px] font-extrabold"
                    data-testid={`home-frac-${l.replace("/", "-")}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* CENTER — SCAN big circular */}
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

            {/* RIGHT — Pieza count + last entry + SAVE */}
            <div className="text-right">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-gray-300 mb-1">
                Pieza {todayCount}
              </div>
              {lastEntry ? (
                <button
                  onClick={() => navigate("/reportes")}
                  className="w-full rounded-md bg-[#DC2626] text-white px-1.5 py-1 flex items-center gap-1.5 text-[10px] font-extrabold shadow"
                  data-testid="home-last-entry"
                >
                  <span className="truncate flex-1 text-left">{lastEntry.worker_name}</span>
                  <span className="font-mono-stat text-sm leading-none">
                    {formatNumber(lastEntry.units, lastEntry.units % 1 === 0 ? 0 : 2)}
                  </span>
                  <span className="bg-white/20 rounded px-1 py-0.5 text-[9px]">SAVE</span>
                </button>
              ) : (
                <div className="h-6" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
