import { useEffect, useMemo, useState } from "react";
import { Loader2, ScanLine } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api, { formatCurrency, formatNumber } from "@/lib/api";

export default function Cosecha() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/harvests");
        setRows(Array.isArray(data) ? data : []);
      } catch (_) { /* ignore */ } finally { setLoading(false); }
    })();
  }, []);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => (b.created_at || b.date || "").localeCompare(a.created_at || a.date || ""));
  }, [rows]);

  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return sorted.filter((r) => r.date === today).length;
  }, [sorted]);

  const activeWorkers = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const set = new Set();
    sorted.forEach((r) => { if (r.date === today && r.worker_id) set.add(r.worker_id); });
    return set.size;
  }, [sorted]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#1D4ED8]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-40" data-testid="cosecha-page">
      {/* Light card */}
      <div className="bg-white rounded-2xl border border-[#E6E0D1] shadow-[0_8px_20px_rgba(30,70,32,0.06)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#EFEADA]">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-[#1D4ED8]" strokeWidth={2.4} />
            <h2
              className="text-[15px] font-extrabold tracking-wide text-[#0F1115] uppercase"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Registro de escáneo
            </h2>
          </div>
          <div className="font-mono-stat text-base font-bold text-[#889078]">
            {sorted.length}
          </div>
        </div>

        {/* List */}
        {sorted.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#889078] font-semibold">
            Sin escaneos registrados aún
          </div>
        ) : (
          <ul className="divide-y divide-[#EFEADA]">
            {sorted.map((r) => {
              let timeLabel = "";
              if (r.created_at) {
                try {
                  const d = new Date(r.created_at);
                  timeLabel = d
                    .toLocaleTimeString("es-MX", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: true,
                    })
                    .toLowerCase();
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
                <li
                  key={r.id}
                  className="px-4 py-3 flex items-center justify-between gap-3"
                  data-testid={`cosecha-row-${r.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[#0F1115] truncate text-xl leading-tight">
                        {r.worker_name}
                      </span>
                      <span className="px-2 py-[2px] rounded-md bg-[#DBE4FF] text-[#1D4ED8] text-[10px] font-extrabold tracking-wider">
                        {sourceLabel}
                      </span>
                    </div>
                    {timeLabel && (
                      <div className="mt-1 font-mono-stat text-[12px] font-semibold text-[#889078]">
                        {timeLabel}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono-stat text-xl font-extrabold text-[#1D4ED8] leading-tight">
                      {formatCurrency(r.payment)}
                    </div>
                    <div className="text-[11px] font-semibold text-[#889078] mt-0.5">
                      <span className="font-mono-stat text-[#0F1115] font-extrabold mr-1">
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

      {/* Bottom action bar: Empleado activo | SCAN | Pieza */}
      <div className="fixed left-0 right-0 bottom-[70px] z-30 pointer-events-none">
        <div className="max-w-5xl mx-auto px-3 pointer-events-auto">
          <div className="bg-[#111] border-t border-[#2A2A2A] rounded-t-2xl px-3 pt-2 pb-3 shadow-2xl">
            <div className="grid grid-cols-3 items-center gap-2">
              <div className="text-[13px] font-semibold text-gray-200">
                Empleado activo: <span className="font-extrabold text-white">{activeWorkers}</span>
              </div>
              <div className="flex items-center justify-center">
                <button
                  onClick={() => navigate("/registrar?mode=qr")}
                  className="w-20 h-20 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] active:scale-95 text-white font-extrabold text-base shadow-[0_6px_20px_rgba(220,38,38,0.5)] flex items-center justify-center transition"
                  data-testid="cosecha-scan-button"
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
          </div>
        </div>
      </div>
    </div>
  );
}
