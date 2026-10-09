import { useEffect, useMemo, useState } from "react";
import { Loader2, ScanLine, Camera } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { formatCurrency, formatNumber, todayISO } from "@/lib/api";

export default function Cosecha() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState({});

  const load = async () => {
    try {
      const { data } = await api.get("/harvests");
      setRows(Array.isArray(data) ? data : []);
    } catch (_) { /* ignore */ }
    try {
      const s = JSON.parse(localStorage.getItem(`agriscan.session.${todayISO()}`) || "{}");
      setSession(s || {});
    } catch (_) { setSession({}); }
  };

  useEffect(() => {
    (async () => { await load(); setLoading(false); })();
  }, []);

  useEffect(() => {
    if (searchParams.get("prompt") === "save") {
      load().then(() => {
        const next = new URLSearchParams(searchParams);
        next.delete("prompt");
        setSearchParams(next, { replace: true });
      });
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) =>
      (b.created_at || b.date || "").localeCompare(a.created_at || a.date || "")
    );
  }, [rows]);

  const sessionReady = !!session.parcelId && !!session.productId;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#1D4ED8]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 top-[64px] bottom-[70px] flex flex-col px-3 pt-3 pb-3 bg-[#F7F5EE]"
      data-testid="cosecha-page"
    >
      {!sessionReady && (
        <div className="bg-white rounded-2xl border border-[#E6E0D1] shadow-[0_8px_20px_rgba(30,70,32,0.06)] px-4 py-3 mb-3 flex items-center justify-center gap-2 text-[#1D4ED8] text-sm font-semibold">
          <Loader2 className="w-4 h-4 animate-spin" /> Preparando jornada…
        </div>
      )}

      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#E6E0D1] shadow-[0_8px_20px_rgba(30,70,32,0.06)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#EFEADA] bg-white shrink-0">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-[#1D4ED8]" strokeWidth={2.4} />
            <h2
              className="text-[15px] font-extrabold tracking-wide text-[#0F1115] uppercase"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Registro de escáneo
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="font-mono-stat text-base font-bold text-[#889078]">
              {sorted.length}
            </div>
            <button
              onClick={() => navigate("/registrar?mode=qr&from=cosecha")}
              className="w-10 h-10 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] active:scale-95 text-white flex items-center justify-center shadow-md transition"
              data-testid="cosecha-camera-button"
              aria-label="Abrir cámara"
              title="Escanear"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
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
      </div>
    </div>
  );
}
