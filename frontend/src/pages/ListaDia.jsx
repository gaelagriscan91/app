import { useEffect, useState } from "react";
import { Loader2, Clock, AlertCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatNumber, todayISO } from "@/lib/api";

export default function ListaDia() {
  const [date, setDate] = useState(todayISO());
  const [attendance, setAttendance] = useState([]);
  const [harvestsByWorker, setHarvestsByWorker] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [attRes, dailyRes] = await Promise.all([
        api.get("/attendance", { params: { date } }),
        api.get("/harvests/daily", { params: { date } }),
      ]);
      setAttendance(attRes.data?.rows || []);
      setHarvestsByWorker(dailyRes.data?.by_worker || []);
    } catch (e) {
      toast.error("No se pudo cargar la lista del día");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Workers working today but without check-in attendance
  const checkedInIds = new Set(attendance.filter((a) => a.check_in).map((a) => a.worker_id));
  const missingCheckIn = harvestsByWorker.filter((w) => !checkedInIds.has(w.worker_id));

  const addCheckIn = async (workerId, workerName) => {
    if (!workerId) return;
    setAddingId(workerId);
    try {
      await api.post("/attendance/scan", { code: workerId, date });
      toast.success(`Entrada registrada: ${workerName}`);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "No se pudo registrar entrada");
    } finally {
      setAddingId(null);
    }
  };

  const [sharing, setSharing] = useState(false);
  const share = async () => {
    if (attendance.length === 0 && harvestsByWorker.length === 0) { toast.error("No hay nada que compartir"); return; }
    setSharing(true);
    const lines = attendance.map((a) => `• ${a.worker_name}: ${a.check_in_hhmm || "--:--"}${a.check_out_hhmm ? ` → ${a.check_out_hhmm}` : ""}${a.hours ? ` (${formatNumber(a.hours, 2)} h)` : ""}`);
    const text = [`📋 AgriScan — Lista del día ${date}`, `👥 ${attendance.length} empleado(s) con entrada`, ...lines,
      ...(missingCheckIn.length ? ["", `⚠️ Sin entrada: ${missingCheckIn.map((w) => w.worker_name).join(", ")}`] : [])].join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "Lista del día", text });
      else { await navigator.clipboard.writeText(text); toast.success("Lista copiada"); }
    } catch (e) {
      if (e?.name !== "AbortError") window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="lista-dia-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Lista del día
          </h1>
          <p className="text-sm text-[#556047] font-semibold">Entradas y horas de empleados</p>
        </div>
        <div className="flex items-end gap-2">
        <div>
          <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field-input !h-12 !text-base"
            data-testid="dia-date-input"
          />
        </div>
        <button onClick={share} disabled={sharing} className="h-12 px-4 rounded-xl bg-[#1D4ED8] text-white font-bold flex items-center gap-2 disabled:opacity-60" data-testid="dia-share-button">
          {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Compartir
        </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-[#1D4ED8]">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* Section 1: Workers with check-in */}
          <div className="field-card p-4 sm:p-5" data-testid="checked-in-section">
            <h3 className="text-base font-bold text-[#1A2210] mb-3 flex items-center gap-2" style={{ fontFamily: "Outfit, sans-serif" }}>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Con entrada <span className="text-sm font-semibold text-[#556047]">· {attendance.length}</span>
            </h3>
            {attendance.length === 0 ? (
              <p className="text-sm text-[#556047] font-semibold py-4 text-center" data-testid="empty-checked-in">
                Nadie tiene entrada registrada en esta fecha
              </p>
            ) : (
              <div className="divide-y divide-[#E2DDD0]">
                {attendance.map((a) => (
                  <div
                    key={a.id || a._id || a.worker_id}
                    className="flex items-center justify-between py-3 gap-3"
                    data-testid={`attendance-row-${a.worker_id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#1A2210] truncate">{a.worker_name}</div>
                      <div className="text-xs text-[#556047] font-semibold">{date}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5 text-sm font-extrabold text-[#1A2210]">
                        <Clock className="w-3.5 h-3.5 text-[#556047]" />
                        <span className="font-mono-stat">{a.check_in_hhmm || "--:--"}</span>
                        {a.check_out_hhmm ? (
                          <>
                            <span className="text-[#889078]">→</span>
                            <span className="font-mono-stat">{a.check_out_hhmm}</span>
                          </>
                        ) : null}
                      </div>
                      {a.hours ? (
                        <div className="text-[11px] text-[#556047] font-semibold font-mono-stat">
                          {formatNumber(a.hours, 2)} h
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Workers in harvests but WITHOUT check-in */}
          {missingCheckIn.length > 0 && (
            <div className="field-card p-4 sm:p-5 border-2 border-red-200 bg-red-50/40" data-testid="missing-checkin-section">
              <h3 className="text-base font-bold text-red-900 mb-1 flex items-center gap-2" style={{ fontFamily: "Outfit, sans-serif" }}>
                <AlertCircle className="w-4 h-4" />
                Sin entrada <span className="text-sm font-semibold text-red-800/80">· {missingCheckIn.length}</span>
              </h3>
              <p className="text-xs text-red-800/80 font-semibold mb-3">
                Están trabajando pero no tienen entrada. Toca para registrarla.
              </p>
              <div className="divide-y divide-red-200/70">
                {missingCheckIn.map((w) => (
                  <button
                    key={w.worker_id}
                    onClick={() => addCheckIn(w.worker_id, w.worker_name)}
                    disabled={addingId === w.worker_id}
                    className="w-full flex items-center justify-between py-3 gap-3 text-left hover:bg-red-100/40 rounded-lg px-2 -mx-2 transition disabled:opacity-60"
                    data-testid={`missing-checkin-${w.worker_id}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                      <div className="min-w-0">
                        <div className="font-bold text-[#1A2210] truncate">{w.worker_name}</div>
                        <div className="text-xs text-[#556047] font-semibold truncate">
                          {date} · {formatNumber(w.units, 0)} u. · {w.count} registro{w.count !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-extrabold text-red-700 shrink-0">
                      {addingId === w.worker_id ? <Loader2 className="w-4 h-4 animate-spin" /> : "+ Entrada"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
