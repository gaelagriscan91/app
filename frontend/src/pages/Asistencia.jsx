import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, LogIn, LogOut, Users, Clock, Loader2, Trash2, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail, todayISO } from "@/lib/api";
import QrScanner from "@/components/QrScanner";
import QuickAddWorker from "@/components/QuickAddWorker";

export default function Asistencia() {
  const [scannerOn, setScannerOn] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState({ rows: [], present: 0, closed: 0, total: 0, total_hours: 0 });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [manualWorker, setManualWorker] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const lastScanRef = useRef({ code: "", at: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const [a, w] = await Promise.all([
        api.get("/attendance", { params: { date } }),
        api.get("/workers"),
      ]);
      setData(a.data);
      setWorkers(w.data);
    } catch (_) {
      toast.error("No se pudo cargar la asistencia");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const handleScan = async (code) => {
    // Debounce: ignore same code within 2.5s
    const now = Date.now();
    if (
      lastScanRef.current.code === code &&
      now - lastScanRef.current.at < 2500
    ) {
      return;
    }
    lastScanRef.current = { code, at: now };
    await submitCode(code);
  };

  const submitCode = async (code) => {
    if (processing) return;
    setProcessing(true);
    try {
      const { data: res } = await api.post("/attendance/scan", { code, date });
      if (res.action === "check_in") {
        toast.success(`✅ Entrada: ${res.worker_name} • ${res.check_in_hhmm}`);
      } else if (res.action === "check_out") {
        toast.success(`🏁 Salida: ${res.worker_name} • ${res.check_out_hhmm} (${res.hours}h)`);
      }
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo registrar");
    } finally {
      setTimeout(() => setProcessing(false), 400);
    }
  };

  const onManualSubmit = async () => {
    if (!manualWorker) {
      toast.error("Selecciona un trabajador");
      return;
    }
    await submitCode(manualWorker);
    setManualWorker("");
  };

  const removeAttendance = async (id) => {
    if (!window.confirm("¿Eliminar este registro de asistencia?")) return;
    try {
      await api.delete(`/attendance/${id}`);
      toast.success("Registro eliminado");
      load();
    } catch (e) {
      toast.error("No se pudo eliminar");
    }
  };

  return (
    <div className="space-y-5" data-testid="asistencia-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Asistencia
          </h1>
          <p className="text-sm text-[#556047] font-semibold">Entrada y salida con escáner QR</p>
        </div>
        <div>
          <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field-input !h-12 !text-base"
            data-testid="attendance-date-input"
          />
        </div>
      </div>

      {/* Scanner */}
      <div className="field-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#1E4620]" />
            <h3 className="text-lg font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
              Escáner QR
            </h3>
          </div>
          <button
            onClick={() => setScannerOn((v) => !v)}
            className={`h-10 px-4 rounded-xl font-bold text-sm flex items-center gap-1.5 transition-colors ${
              scannerOn
                ? "bg-red-50 text-red-700 border-2 border-red-200 hover:bg-red-100"
                : "bg-[#1E4620] text-white border-2 border-[#1E4620] hover:bg-[#153417]"
            }`}
            data-testid="toggle-scanner-button"
          >
            {scannerOn ? <><CameraOff className="w-4 h-4" /> Detener</> : <><Camera className="w-4 h-4" /> Iniciar</>}
          </button>
        </div>

        {scannerOn ? (
          <QrScanner active={scannerOn} onScan={handleScan} />
        ) : (
          <div className="rounded-2xl bg-[#F0EDE1] border-2 border-dashed border-[#D4CEB8] py-10 px-4 text-center">
            <Camera className="w-10 h-10 mx-auto text-[#889078] mb-2" />
            <p className="text-sm font-semibold text-[#556047]">
              Toca <span className="text-[#1E4620]">Iniciar</span> para encender la cámara y escanear el código QR del trabajador.
            </p>
          </div>
        )}

        {/* Manual fallback */}
        <div className="pt-3 border-t border-[#E2DDD0]">
          <div className="text-xs font-bold text-[#1A2210] uppercase tracking-wider mb-2">
            O selecciona manualmente
          </div>
          <div className="flex gap-2">
            <select
              value={manualWorker}
              onChange={(e) => setManualWorker(e.target.value)}
              className="field-input !h-12 !text-base flex-1"
              data-testid="manual-worker-select"
            >
              <option value="">— Trabajador —</option>
              {workers.map((w) => (
                <option key={w.id} value={w.qr_code || w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setQuickAddOpen(true)}
              type="button"
              className="h-12 w-12 bg-[#1E4620] hover:bg-[#153417] text-white rounded-xl flex items-center justify-center"
              title="Agregar nuevo trabajador"
              data-testid="asist-quick-add-button"
            >
              <UserPlus className="w-4 h-4" />
            </button>
            <button
              onClick={onManualSubmit}
              disabled={processing || !manualWorker}
              className="h-12 px-4 bg-[#E65100] hover:bg-[#C63D00] text-white font-bold rounded-xl disabled:opacity-50 flex items-center gap-1.5"
              data-testid="manual-submit-button"
            >
              <UserCheck className="w-5 h-5" />
              Marcar
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-[#1E4620] text-white p-4 border-2 border-[#153417] shadow-sm" data-testid="stat-present">
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-90 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> En campo
          </div>
          <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{data.present}</div>
          <div className="text-[11px] font-semibold opacity-85 mt-1">Sin salida</div>
        </div>
        <div className="rounded-2xl bg-white border-2 border-[#E2DDD0] text-[#1A2210] p-4 shadow-sm" data-testid="stat-closed">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#556047] flex items-center gap-1">
            <LogOut className="w-3.5 h-3.5" /> Cerrados
          </div>
          <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{data.closed}</div>
          <div className="text-[11px] font-semibold text-[#556047] mt-1">Jornada completa</div>
        </div>
        <div className="rounded-2xl bg-[#E65100] text-white p-4 border-2 border-[#C63D00] shadow-sm" data-testid="stat-hours">
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-90 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Horas
          </div>
          <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{data.total_hours}</div>
          <div className="text-[11px] font-semibold opacity-85 mt-1">Total acumulado</div>
        </div>
      </div>

      {/* List */}
      <div className="field-card p-4 sm:p-5">
        <h3 className="text-lg font-bold text-[#1A2210] mb-3" style={{ fontFamily: "Outfit, sans-serif" }}>
          Registros del día
        </h3>
        {loading ? (
          <div className="flex items-center justify-center py-6 text-[#1E4620]">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : data.rows.length === 0 ? (
          <p className="text-sm text-[#556047] font-semibold py-4 text-center" data-testid="attendance-empty">
            Sin registros para esta fecha
          </p>
        ) : (
          <div className="divide-y divide-[#E2DDD0]">
            {data.rows.map((r) => (
              <div
                key={r.id}
                className="py-3 flex items-center justify-between gap-3"
                data-testid={`attendance-row-${r.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#1A2210] truncate">{r.worker_name}</div>
                  <div className="text-xs text-[#556047] font-semibold mt-0.5 flex items-center flex-wrap gap-x-3 gap-y-0.5">
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <LogIn className="w-3.5 h-3.5" /> {r.check_in_hhmm || "—"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-orange-700">
                      <LogOut className="w-3.5 h-3.5" /> {r.check_out_hhmm || "—"}
                    </span>
                    {r.hours ? (
                      <span className="inline-flex items-center gap-1 text-[#1E4620] font-bold">
                        <Clock className="w-3.5 h-3.5" /> {r.hours}h
                      </span>
                    ) : null}
                  </div>
                </div>
                <div>
                  {!r.check_out ? (
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                      En campo
                    </span>
                  ) : (
                    <span className="text-[10px] bg-[#F0EDE1] text-[#556047] border border-[#D4CEB8] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                      Cerrado
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeAttendance(r.id)}
                  className="w-9 h-9 rounded-lg hover:bg-red-50 text-red-600 flex items-center justify-center"
                  data-testid={`attendance-delete-${r.id}`}
                  aria-label="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <QuickAddWorker
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={(w) => {
          setWorkers((prev) => [...prev, w]);
          setManualWorker(w.qr_code || w.id);
        }}
      />
    </div>
  );
}
