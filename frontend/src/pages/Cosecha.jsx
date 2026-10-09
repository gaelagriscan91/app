import { useEffect, useMemo, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api, { formatCurrency, formatNumber } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function Cosecha() {
  const navigate = useNavigate();
  const { logout } = useAuth();
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

  const handleCheckOut = async () => {
    await logout();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-104px)] -mx-4 -my-5 sm:-my-7 bg-[#1A1A1A] flex items-center justify-center text-white">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#1A1A1A] text-white -mx-4 -my-5 sm:-my-7 min-h-[calc(100vh-104px)] flex flex-col pb-28" data-testid="cosecha-page">
      {/* Header: title + red check-out */}
      <div className="px-4 pt-4 flex items-start justify-between">
        <div className="text-base font-semibold text-white" style={{ fontFamily: "Outfit, sans-serif" }}>
          Mis escaneo
        </div>
        <button
          onClick={handleCheckOut}
          className="w-11 h-11 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] active:scale-95 text-white flex items-center justify-center shadow-lg"
          data-testid="cosecha-checkout-button"
          aria-label="Check out"
          title="Check out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* List */}
      <div className="px-4 mt-3 flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500 font-semibold">
            Sin escaneos registrados aún
          </div>
        ) : (
          <ul className="divide-y divide-[#1F1F1F]">
            {sorted.map((r) => {
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
