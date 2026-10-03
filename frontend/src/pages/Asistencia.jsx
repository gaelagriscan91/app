import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard, Users, Loader2, Trash2, X, ArrowLeft, UserPlus, Search, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiErrorDetail, todayISO } from "@/lib/api";
import QrScanner from "@/components/QrScanner";
import QuickAddWorker from "@/components/QuickAddWorker";

export default function Asistencia() {
  const navigate = useNavigate();
  const [scannerOn, setScannerOn] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [products, setProducts] = useState([]);
  const [crews, setCrews] = useState([]);
  const [date] = useState(todayISO());
  const [data, setData] = useState({ rows: [], present: 0, closed: 0, total: 0, total_hours: 0 });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showCrewPicker, setShowCrewPicker] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Session
  const [siteId, setSiteId] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [productId, setProductId] = useState("");

  const lastScanRef = useRef({ code: "", at: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const [a, w, p, pr, c] = await Promise.all([
        api.get("/attendance", { params: { date } }),
        api.get("/workers"),
        api.get("/parcels"),
        api.get("/products"),
        api.get("/crews"),
      ]);
      setData(a.data);
      setWorkers(w.data);
      setParcels(p.data);
      setProducts(pr.data);
      setCrews(c.data);
    } catch (_) {
      toast.error("No se pudo cargar la asistencia");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const selectedParcel = parcels.find((p) => p.id === parcelId);
  const selectedProduct = products.find((p) => p.id === productId);

  const presentWorkerIds = useMemo(() => new Set(data.rows.map((r) => r.worker_id)), [data.rows]);

  const submitCode = async (code) => {
    if (processing || !code) return;
    setProcessing(true);
    try {
      const { data: res } = await api.post("/attendance/scan", { code, date });
      if (res.action === "check_in") toast.success(`✅ Entrada: ${res.worker_name} • ${res.check_in_hhmm}`);
      else if (res.action === "check_out") toast.success(`🏁 Salida: ${res.worker_name} • ${res.check_out_hhmm} (${res.hours}h)`);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo registrar");
    } finally {
      setTimeout(() => setProcessing(false), 300);
    }
  };

  const handleScan = async (code) => {
    const now = Date.now();
    if (lastScanRef.current.code === code && now - lastScanRef.current.at < 2500) return;
    lastScanRef.current = { code, at: now };
    await submitCode(code);
  };

  const removeAttendance = async (id) => {
    if (!window.confirm("¿Eliminar este registro?")) return;
    try { await api.delete(`/attendance/${id}`); toast.success("Eliminado"); load(); }
    catch (e) { toast.error("No se pudo eliminar"); }
  };

  const moveCrew = async (crew) => {
    setShowCrewPicker(false);
    const toCheck = crew.workers.filter((w) => !presentWorkerIds.has(w.id));
    if (toCheck.length === 0) {
      toast.info("Todos los de esta cuadrilla ya están registrados");
      return;
    }
    toast.success(`Registrando ${toCheck.length} de ${crew.name}…`);
    for (const w of toCheck) {
      try {
        await api.post("/attendance/scan", { code: w.id, date });
      } catch (_) {}
    }
    await load();
    toast.success(`✓ Cuadrilla ${crew.name} registrada`);
  };

  // ======================= Crew Summary View =======================
  if (showSummary) {
    const groupedByLocation = {};
    data.rows.forEach((r) => {
      const key = selectedParcel?.name || "Sin ubicación";
      if (!groupedByLocation[key]) groupedByLocation[key] = [];
      // Find worker to get pieces (harvests today for that worker)
      groupedByLocation[key].push(r);
    });
    const totalWorkers = data.rows.length;

    return (
      <div className="min-h-[calc(100vh-5rem)] -mx-4 -my-5 sm:-mx-0 sm:-my-0" data-testid="crew-summary-view">
        <div className="bg-[#1e40af] text-white px-5 pt-5 pb-6 rounded-b-xl">
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => setShowSummary(false)} className="flex items-center gap-1" data-testid="close-summary">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-extrabold flex-1 pl-2" style={{ fontFamily: "Outfit, sans-serif" }}>
              Crew Summary
            </h2>
            <div className="flex items-center gap-2">
              <button className="bg-white text-[#1e40af] px-4 h-9 rounded-full text-sm font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 bg-gray-500 text-white rounded-full p-0.5" /> Review
              </button>
              <button className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-[#1e40af]">
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 pt-5">
          <div className="grid grid-cols-4 gap-4 pb-5 border-b border-[#E2DDD0]">
            <Stat label="Workers" value={totalWorkers} />
            <Stat label="Bins" value={0} />
            <Stat label="Cases" value={0} />
            <Stat label="Clamshells" value={0} />
          </div>

          <div className="py-3 text-sm text-[#556047] font-semibold">
            Employee group by: <span className="text-[#1e40af] font-bold border-b-2 border-[#1e40af]">Location</span>
            <span className="mx-2 text-[#889078]">|</span>
            <span className="text-[#556047]">Job</span>
          </div>

          {Object.entries(groupedByLocation).map(([loc, rows]) => (
            <div key={loc} className="mt-2">
              <div className="text-sm font-bold text-[#1A2210] py-2" style={{ fontFamily: "Outfit, sans-serif" }}>
                {loc} ({rows.length})
              </div>
              <div className="space-y-2">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="bg-white border border-[#E2DDD0] rounded-xl p-4 flex items-stretch border-l-4 border-l-emerald-500"
                    data-testid={`summary-row-${r.id}`}
                  >
                    <div className="flex-1">
                      <div className="text-xs text-[#889078] font-semibold uppercase tracking-wider">Name</div>
                      <div className="font-bold text-[#1A2210] text-base">{r.worker_name}</div>
                    </div>
                    <div className="text-right pr-6 border-r border-[#E2DDD0]">
                      <div className="text-xs text-[#889078] font-semibold uppercase tracking-wider">Hours</div>
                      <div className="font-mono-stat text-base text-[#1A2210]">
                        {r.hours ? `${Math.floor(r.hours)}h ${Math.round((r.hours % 1) * 60)}min` : "0min"}
                      </div>
                    </div>
                    <div className="text-right pl-6">
                      <div className="text-xs text-[#889078] font-semibold uppercase tracking-wider">Pieces</div>
                      <div className="font-mono-stat text-base text-[#1A2210]">0</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {data.rows.length === 0 && (
            <p className="text-center text-[#556047] font-semibold py-8">Sin registros</p>
          )}
        </div>
      </div>
    );
  }

  // ======================= Check-in View (PickTrace style) =======================
  return (
    <div className="-mx-4 -my-5 sm:-mx-0 sm:-my-0" data-testid="asistencia-page">
      {/* Orange header card */}
      <div className="bg-[#F4B860] px-5 pt-4 pb-5 rounded-b-2xl">
        <div className="flex items-center justify-between text-[#1A2210] mb-3">
          <button onClick={() => navigate("/")} className="flex items-center gap-1 font-semibold" data-testid="back-button">
            <ArrowLeft className="w-5 h-5" /> Atrás
          </button>
          <h1 className="text-lg font-extrabold" style={{ fontFamily: "Outfit, sans-serif" }}>Check in</h1>
          <button onClick={() => setShowSummary(true)} data-testid="open-summary-button" className="text-sm font-bold text-[#1A2210]">
            Resumen
          </button>
        </div>

        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-xs font-bold text-[#5A4017] uppercase tracking-wider">Checked in</div>
            <div className="font-mono-stat text-5xl text-[#1A2210] leading-none mt-1">{data.rows.length}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => crews.length > 0 ? setShowCrewPicker(true) : toast.info("Primero crea una cuadrilla en Módulos")}
              className="bg-white text-[#1A2210] px-4 h-10 rounded-full text-sm font-bold flex items-center gap-1.5 shadow-sm"
              data-testid="move-crew-button"
            >
              <Users className="w-4 h-4" /> Move Crew
            </button>
            <button
              onClick={() => setManualOpen(true)}
              className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-[#1A2210]"
              title="Manual"
              data-testid="manual-open-button"
            >
              <Keyboard className="w-5 h-5" />
            </button>
            <button
              onClick={() => setScannerOn((v) => !v)}
              className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${scannerOn ? "bg-red-100 text-red-700" : "bg-white text-[#1A2210]"}`}
              title={scannerOn ? "Detener" : "Escanear"}
              data-testid="toggle-scanner-button"
            >
              {scannerOn ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Session card (Site, Location, Job) */}
        <div className="bg-white rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#FDF6EC] rounded-lg px-3 py-2">
              <div className="text-[10px] text-[#889078] font-bold uppercase tracking-wider">Site</div>
              <input
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                placeholder="CA Site 1"
                className="w-full bg-transparent font-bold text-[#1A2210] text-sm outline-none"
                data-testid="site-input"
              />
            </div>
            <div className="bg-[#FDF6EC] rounded-lg px-3 py-2">
              <div className="text-[10px] text-[#889078] font-bold uppercase tracking-wider">Location</div>
              <select
                value={parcelId}
                onChange={(e) => setParcelId(e.target.value)}
                className="w-full bg-transparent font-bold text-[#1A2210] text-sm outline-none truncate"
                data-testid="location-select"
              >
                <option value="">— Parcela —</option>
                {parcels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="bg-[#FDF6EC] rounded-lg px-3 py-2">
            <div className="text-[10px] text-[#889078] font-bold uppercase tracking-wider">Job</div>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full bg-transparent font-bold text-[#1A2210] text-sm outline-none"
              data-testid="job-select"
            >
              <option value="">— Trabajo / Producto —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} — Picking</option>)}
            </select>
          </div>
        </div>

        <div className="text-center text-[#5A4017] text-sm font-semibold mt-4">
          Escanea el QR del trabajador para registrar su entrada.
        </div>
      </div>

      {/* Scanner area */}
      {scannerOn && (
        <div className="px-4 mt-4">
          <QrScanner active={scannerOn} onScan={handleScan} />
        </div>
      )}

      {/* Attendance list */}
      <div className="px-4 mt-4 space-y-2 pb-6">
        {loading ? (
          <div className="flex justify-center py-6 text-[#1E4620]"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : data.rows.length === 0 ? (
          <p className="text-center text-[#556047] font-semibold py-6" data-testid="attendance-empty">
            Aún no hay trabajadores registrados hoy
          </p>
        ) : (
          data.rows.map((r) => (
            <div
              key={r.id}
              className="bg-white border border-[#E2DDD0] rounded-xl p-3 flex items-start gap-3"
              data-testid={`attendance-row-${r.id}`}
            >
              <div className="min-w-[70px]">
                <div className="text-xs text-[#889078] font-semibold uppercase tracking-wider">Hora</div>
                <div className="font-bold text-[#1A2210] text-base">{r.check_in_hhmm}</div>
                {r.check_out_hhmm && (
                  <div className="text-xs text-orange-700 font-bold mt-0.5">↓ {r.check_out_hhmm}</div>
                )}
              </div>
              <div className="min-w-0 flex-1 border-l border-[#E2DDD0] pl-3">
                <div className="text-xs text-[#889078] font-semibold uppercase tracking-wider">Trabajador</div>
                <div className="font-bold text-[#1A2210]">{r.worker_name}</div>
                <div className="text-xs text-[#556047] font-semibold mt-0.5 truncate">
                  {selectedParcel?.name || "—"}, {selectedProduct?.name || "—"} — Picking
                </div>
              </div>
              <button
                onClick={() => removeAttendance(r.id)}
                className="w-8 h-8 rounded-lg hover:bg-red-50 text-red-600 flex items-center justify-center"
                data-testid={`attendance-delete-${r.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Manual entry modal */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setManualOpen(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Entrada manual</h3>
              <button onClick={() => setManualOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <select
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="field-input !h-12 !text-base w-full mb-3"
              data-testid="manual-worker-select"
            >
              <option value="">— Trabajador —</option>
              {workers.map((w) => <option key={w.id} value={w.qr_code || w.id}>{w.name}</option>)}
            </select>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setQuickAddOpen(true)}
                className="flex-1 h-11 bg-white border-2 border-[#1E4620] text-[#1E4620] font-bold rounded-xl flex items-center justify-center gap-1.5"
                data-testid="asist-quick-add-button"
              >
                <UserPlus className="w-4 h-4" /> Nuevo
              </button>
              <button
                onClick={async () => { await submitCode(manualCode); setManualCode(""); setManualOpen(false); }}
                disabled={!manualCode || processing}
                className="flex-1 h-11 bg-[#1E4620] hover:bg-[#153417] text-white font-bold rounded-xl disabled:opacity-50"
                data-testid="manual-submit-button"
              >
                Marcar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crew picker modal */}
      {showCrewPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowCrewPicker(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Mover cuadrilla</h3>
              <button onClick={() => setShowCrewPicker(false)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-[#556047] mb-3 font-semibold">Registra la entrada de todos los trabajadores de una cuadrilla</p>
            <div className="space-y-2 max-h-80 overflow-auto">
              {crews.map((c) => (
                <button
                  key={c.id}
                  onClick={() => moveCrew(c)}
                  className="w-full text-left bg-[#F7F5EE] border-2 border-[#E2DDD0] hover:border-[#1E4620] rounded-xl p-3"
                  data-testid={`move-crew-${c.id}`}
                >
                  <div className="font-bold text-[#1A2210]">{c.name}</div>
                  <div className="text-xs text-[#556047] font-semibold mt-0.5">
                    {c.boss?.name ? `Jefe: ${c.boss.name} • ` : ""}{c.worker_count} trabajador(es)
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <QuickAddWorker
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={(w) => {
          setWorkers((prev) => [...prev, w]);
          setManualCode(w.qr_code || w.id);
        }}
      />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-xs text-[#556047] font-semibold">{label}</div>
      <div className="font-mono-stat text-3xl text-[#1A2210] mt-1">{value}</div>
    </div>
  );
}
