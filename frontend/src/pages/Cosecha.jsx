import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import api, { formatCurrency, formatNumber } from "@/lib/api";

export default function Cosecha() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/harvests");
        setRows(Array.isArray(data) ? data : []);
      } catch (_) { /* ignore */ } finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    const list = q
      ? rows.filter((r) => (r.worker_name || "").toLowerCase().includes(q))
      : rows;
    // Sort newest first by created_at (fallback to date + _id)
    return [...list].sort((a, b) => (b.created_at || b.date || "").localeCompare(a.created_at || a.date || ""));
  }, [rows, search]);

  // Totals
  const totals = useMemo(() => {
    const units = filtered.reduce((s, r) => s + Number(r.units || 0), 0);
    const payment = filtered.reduce((s, r) => s + Number(r.payment || 0), 0);
    const workers = new Set(filtered.map((r) => r.worker_id)).size;
    return { units, payment, workers };
  }, [filtered]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-104px)] -mx-4 -my-5 sm:-my-7 bg-[#1A1A1A] flex items-center justify-center text-white">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#1A1A1A] text-white -mx-4 -my-5 sm:-my-7 min-h-[calc(100vh-104px)] flex flex-col pb-28" data-testid="cosecha-page">
      {/* Totals strip */}
      <div className="px-4 pt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[#1F1F1F] px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Trabajadores</div>
          <div className="font-mono-stat text-lg font-extrabold text-white">{totals.workers}</div>
        </div>
        <div className="rounded-xl bg-[#1F1F1F] px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Piezas</div>
          <div className="font-mono-stat text-lg font-extrabold text-white">{formatNumber(totals.units, totals.units % 1 === 0 ? 0 : 2)}</div>
        </div>
        <div className="rounded-xl bg-[#1F1F1F] px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Pago</div>
          <div className="font-mono-stat text-lg font-extrabold text-sky-400">{formatCurrency(totals.payment)}</div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar trabajador…"
            className="w-full h-10 bg-[#262626] border border-[#333] rounded-xl pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#1D4ED8]"
            data-testid="cosecha-search-input"
          />
        </div>
      </div>

      {/* List */}
      <div className="px-4 mt-3 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400 font-semibold">
            {search ? "Sin coincidencias" : "Sin cosechas registradas aún"}
          </div>
        ) : (
          <ul className="divide-y divide-[#1F1F1F]">
            {filtered.map((r) => {
              const dt = new Date((r.date || "") + "T00:00:00");
              const dateLabel = isNaN(dt) ? (r.date || "") : `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
              let timeLabel = "";
              if (r.created_at) {
                try {
                  const d = new Date(r.created_at);
                  timeLabel = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).toLowerCase();
                } catch (_) {}
              }
              const notes = (r.notes || "").toLowerCase();
              const sourceLabel = notes.includes("manual") || notes.includes("ajuste")
                ? "MANUAL"
                : notes.includes("comparti") || notes.includes("shared")
                ? "GRUPO"
                : "QR";
              const unitWord = (r.unit_label || "pieza").toLowerCase();
              const unitShort = unitWord.startsWith("libra") ? "LB" : unitWord.startsWith("hora") ? "HR" : "PZA";
              return (
                <li key={r.id} className="py-3 flex items-center justify-between gap-3" data-testid={`cosecha-row-${r.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-white truncate text-lg leading-tight">{r.worker_name}</div>
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
    </div>
  );
}
