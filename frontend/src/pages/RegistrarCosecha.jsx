import { useEffect, useState } from "react";
import { ScanLine, Loader2 } from "lucide-react";
import { formatCurrency, todayISO } from "@/lib/api";
import ScanHarvestMode from "@/components/ScanHarvestMode";

export default function RegistrarCosecha() {
  const todayKey = todayISO();
  const scanLogKey = `agriscan.scanlog.${todayKey}`;
  const [scanLog, setScanLog] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const readLog = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(scanLogKey) || "[]");
      setScanLog(raw);
    } catch (_) {
      setScanLog([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    readLog();
    // Poll to pick up updates from ScanHarvestMode's writes
    const t = setInterval(readLog, 1200);
    const onStorage = (e) => { if (e.key === scanLogKey) readLog(); };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(t);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanLogKey]);

  return (
    <div className="space-y-5" data-testid="registrar-cosecha-page">
      <ScanHarvestMode />

      {/* Scan log — always visible below the scanner */}
      <div className="field-card p-0 overflow-hidden" data-testid="scan-log-section">
        <div className="px-5 py-3 border-b border-[#E2DDD0] flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-[#1D4ED8]" />
          <div className="text-xs font-extrabold uppercase tracking-wider text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
            Registro de escáneo
          </div>
          <span className="ml-auto text-[11px] text-[#889078] font-bold font-mono-stat">
            {scanLog.length}
          </span>
        </div>
        {!loaded ? (
          <div className="px-5 py-6 flex items-center justify-center text-[#1D4ED8]">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : scanLog.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-[#556047] font-semibold">
            Sin escaneos todavía. Apenas escanees aparecerán aquí.
          </div>
        ) : (
          <ul className="divide-y divide-[#E2DDD0] max-h-[320px] overflow-y-auto">
            {scanLog.slice(0, 100).map((e) => {
              const d = new Date(e.at);
              const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              const basePrice = Number(e.priceAt) || 0;
              const frac = typeof e.fraction === "number" ? e.fraction : 1;
              const earned = e.earned !== undefined ? Number(e.earned) : basePrice * frac;
              const isShared = e.sharedBasket === true;
              const pending = isShared && e.earned === undefined;
              const fracLabel = frac === 1 ? "" : frac === 0.5 ? "½" : frac === 0.75 ? "¾" : frac === 0.25 ? "¼" : frac.toFixed(2);
              return (
                <li key={e.id} className="px-5 py-2.5 flex items-center justify-between gap-3" data-testid={`page-scanlog-${e.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[#1A2210] truncate flex items-center gap-1.5 flex-wrap">
                      {e.name}
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        e.source === "manual" ? "bg-[#DC2626]/15 text-[#DC2626]" : "bg-[#1D4ED8]/15 text-[#1D4ED8]"
                      }`}>
                        {e.source === "manual" ? "Manual" : "QR"}
                      </span>
                      {fracLabel && !isShared && (
                        <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1D4ED8]/15 text-[#1D4ED8]">
                          {fracLabel}
                        </span>
                      )}
                      {isShared && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E65100]/15 text-[#E65100]">
                          Compartida
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#556047] font-semibold font-mono-stat">
                      {time}
                    </div>
                  </div>
                  <div className={`font-mono-stat text-base font-extrabold shrink-0 ${pending ? "text-[#889078]" : "text-[#1D4ED8]"}`}>
                    {pending ? "—" : formatCurrency(earned)}
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
