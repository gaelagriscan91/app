import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera, CameraOff, Keyboard, Users, Loader2, Trash2, X, ArrowLeft, UserPlus,
  Search, CheckCircle2, Sun, Moon, ShoppingBasket, CloudCheck, ChevronRight, MapPin, UserCircle2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiErrorDetail, todayISO } from "@/lib/api";
import QrScanner from "@/components/QrScanner";
import QuickAddWorker from "@/components/QuickAddWorker";

const SESSION_KEY = (date) => `agriscan.session.${date}`;

function loadSession(date) {
  try {
    const raw = localStorage.getItem(SESSION_KEY(date));
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { parcelId: "", crewId: "", productId: "" };
}

export default function Asistencia() {
  const navigate = useNavigate();
  const [view, setView] = useState("hub"); // "hub" | "checkin" | "summary"
  const [date] = useState(todayISO());
  const [data, setData] = useState({ rows: [], present: 0, closed: 0, total: 0, total_hours: 0 });
  const [workers, setWorkers] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [products, setProducts] = useState([]);
  const [crews, setCrews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Session (persisted in localStorage per-date)
  const [session, setSession] = useState(() => loadSession(todayISO()));
  const [sessionModalOpen, setSessionModalOpen] = useState(false);

  // Check-in sub-view state
  const [scannerOn, setScannerOn] = useState(false);
  const [showCrewPicker, setShowCrewPicker] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [confirmCheckout, setConfirmCheckout] = useState(false);
  const [checkingOutAll, setCheckingOutAll] = useState(false);
  const lastScanRef = useRef({ code: "", at: 0 });

  const saveSession = (patch) => {
    const next = { ...session, ...patch };
    setSession(next);
    try { localStorage.setItem(SESSION_KEY(date), JSON.stringify(next)); } catch (_) {}
  };

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

  const selectedParcel = parcels.find((p) => p.id === session.parcelId);
  const selectedProduct = products.find((p) => p.id === session.productId);
  const selectedCrew = crews.find((c) => c.id === session.crewId);
  const mayordomoName = session.mayordomo || selectedCrew?.boss?.name || "—";

  const presentCount = data.rows.length;
  const openCount = data.rows.filter((r) => !r.check_out_hhmm).length;
  const presentWorkerIds = useMemo(() => new Set(data.rows.map((r) => r.worker_id)), [data.rows]);

  const nowGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 19) return "Buenas tardes";
    return "Buenas noches";
  };

  const prettyDate = new Date().toLocaleDateString("es-MX", {
    day: "numeric", month: "short", year: "numeric",
  });

  // ============== Scan / Check-in / Check-out ==============
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
      try { await api.post("/attendance/scan", { code: w.id, date }); } catch (_) {}
    }
    await load();
    toast.success(`✓ Cuadrilla ${crew.name} registrada`);
  };

  const checkoutAll = async () => {
    const open = data.rows.filter((r) => !r.check_out_hhmm);
    if (open.length === 0) {
      toast.info("No hay trabajadores con jornada abierta");
      setConfirmCheckout(false);
      return;
    }
    setCheckingOutAll(true);
    let ok = 0, fail = 0;
    for (const r of open) {
      try {
        await api.post("/attendance/scan", { code: r.worker_id, date });
        ok++;
      } catch (_) { fail++; }
    }
    await load();
    setCheckingOutAll(false);
    setConfirmCheckout(false);
    toast.success(`🏁 Jornada cerrada • ${ok} salida(s)${fail ? ` • ${fail} fallo(s)` : ""}`);
  };

  // ============== Tile Click Handlers ==============
  const onCheckIn = () => {
    if (!session.parcelId || !session.mayordomo) {
      toast.info("Primero elige Rancho y Mayordomo");
      setSessionModalOpen(true);
      return;
    }
    setView("checkin");
  };

  const onPicking = () => {
    if (!session.parcelId || !session.productId) {
      toast.info("Primero elige Rancho y Trabajo");
      setSessionModalOpen(true);
      return;
    }
    if (presentCount === 0) {
      toast.error("No puedes empezar a cosechar: aún no hay trabajadores con entrada registrada");
      return;
    }
    // Navigate to QR harvest mode with session preloaded
    const params = new URLSearchParams({
      mode: "qr",
      parcel: session.parcelId,
      product: session.productId,
    });
    navigate(`/registrar?${params.toString()}`);
  };

  const onCheckOut = () => {
    if (openCount === 0) {
      toast.info("No hay trabajadores con jornada abierta");
      return;
    }
    setConfirmCheckout(true);
  };

  // ============== VIEWS ==============
  if (view === "summary") return (
    <SummaryView
      data={data}
      selectedParcel={selectedParcel}
      onClose={() => setView("checkin")}
    />
  );

  if (view === "checkin") return (
    <CheckInView
      navigate={navigate}
      data={data}
      loading={loading}
      scannerOn={scannerOn}
      setScannerOn={setScannerOn}
      selectedParcel={selectedParcel}
      selectedProduct={selectedProduct}
      session={session}
      saveSession={saveSession}
      parcels={parcels}
      products={products}
      crews={crews}
      handleScan={handleScan}
      removeAttendance={removeAttendance}
      setManualOpen={setManualOpen}
      setShowCrewPicker={setShowCrewPicker}
      goBack={() => setView("hub")}
      openSummary={() => setView("summary")}
      // Modals
      manualOpen={manualOpen}
      manualCode={manualCode}
      setManualCode={setManualCode}
      workers={workers}
      setWorkers={setWorkers}
      setManualOpen2={setManualOpen}
      quickAddOpen={quickAddOpen}
      setQuickAddOpen={setQuickAddOpen}
      submitCode={submitCode}
      processing={processing}
      showCrewPicker={showCrewPicker}
      setShowCrewPicker2={setShowCrewPicker}
      moveCrew={moveCrew}
    />
  );

  // ============== HUB VIEW (default) — PickTrace style ==============
  return (
    <div className="-mx-4 -my-5 sm:-mx-0 sm:-my-0 min-h-[calc(100vh-5rem)]" data-testid="asistencia-hub">
      {/* Navy dark top panel */}
      <div className="bg-[#1E2746] text-white px-5 pt-5 pb-10 rounded-b-[28px]">
        {/* Top row: back + synced chip */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"
            data-testid="hub-back-button"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 h-9 text-sm font-semibold" data-testid="synced-badge">
            Sincronizado <CloudCheck className="w-4 h-4" />
          </div>
        </div>

        {/* Date */}
        <div className="mt-4 text-sm text-white/70 font-semibold capitalize">{prettyDate}</div>

        {/* Greeting */}
        <h1
          className="mt-1 text-[26px] sm:text-3xl font-extrabold leading-tight"
          style={{ fontFamily: "Outfit, sans-serif" }}
          data-testid="hub-greeting"
        >
          {nowGreeting()}, hoy trabajas en{" "}
          <span className="text-[#F4B860]">{selectedParcel?.name || "—"}</span>
          {" "}y{" "}
          <span className="text-[#F4B860]">{selectedProduct?.name || "—"}</span> picking.
        </h1>

        {/* Rancho / Mayordomo chip-row */}
        <button
          onClick={() => setSessionModalOpen(true)}
          className="mt-4 w-full bg-white/10 hover:bg-white/15 border border-white/15 rounded-2xl px-4 py-3 flex items-center justify-between text-left"
          data-testid="open-session-modal"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-white/60 font-bold uppercase tracking-wider">
              <MapPin className="w-3.5 h-3.5" /> Rancho
              <span className="mx-2 opacity-30">•</span>
              <UserCircle2 className="w-3.5 h-3.5" /> Mayordomo
            </div>
            <div className="font-bold text-base truncate mt-0.5">
              {selectedParcel?.name || "Elige rancho"}
              <span className="text-white/50 mx-2">•</span>
              {mayordomoName}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/60" />
        </button>

        {/* Three Tiles */}
        <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
          <Tile
            testid="tile-check-in"
            label="Check in"
            onClick={onCheckIn}
            colorFrom="#F6C27A"
            colorTo="#E89C3F"
            icon={<Sun className="w-9 h-9" strokeWidth={2.3} />}
            badge={presentCount > 0 ? presentCount : null}
          />
          <Tile
            testid="tile-picking"
            label="Picking"
            onClick={onPicking}
            colorFrom="#DD6B6B"
            colorTo="#B23A3A"
            icon={<ShoppingBasket className="w-9 h-9" strokeWidth={2.3} />}
          />
          <Tile
            testid="tile-check-out"
            label="Check out"
            onClick={onCheckOut}
            colorFrom="#8075C9"
            colorTo="#5A4A98"
            icon={<Moon className="w-9 h-9" strokeWidth={2.3} />}
            badge={openCount > 0 ? openCount : null}
          />
        </div>
      </div>

      {/* White lower panel */}
      <div className="bg-[#F7F5EE] -mt-5 rounded-t-[28px] px-4 pt-5 pb-10 relative">
        <button
          className="absolute right-5 -top-6 w-12 h-12 rounded-full bg-white shadow-lg flex items-center justify-center text-[#1E2746]"
          onClick={() => toast.info("Buscar — próximamente")}
          data-testid="hub-search-button"
        >
          <Search className="w-5 h-5" strokeWidth={2.5} />
        </button>

        {/* Status strip */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <MiniStat label="Entrada" value={presentCount} color="#E89C3F" />
          <MiniStat label="En campo" value={openCount} color="#1E4620" />
          <MiniStat label="Salida" value={presentCount - openCount} color="#5A4A98" />
        </div>

        {loading ? (
          <div className="flex justify-center py-8 text-[#1E4620]"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : data.rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2DDD0] py-10 text-center" data-testid="hub-empty">
            <p className="text-[#889078] font-semibold">No piece work today.</p>
            <p className="text-xs text-[#889078] mt-1">Toca <b>Check in</b> para registrar entradas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.rows.map((r) => {
              const w = workers.find((x) => x.id === r.worker_id);
              const shortId = (w?.id_document || w?.id || "").toString().slice(-3) || "—";
              return (
                <div
                  key={r.id}
                  className="bg-white border border-[#E2DDD0] rounded-2xl p-3 flex items-center gap-3"
                  data-testid={`hub-row-${r.id}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#F0EDE1] flex items-center justify-center text-[#1E2746] font-mono-stat text-sm">
                    {shortId}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-[#889078] font-bold uppercase tracking-wider">Name</div>
                    <div className="font-bold text-[#1A2210] truncate">{r.worker_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[#889078] font-bold uppercase tracking-wider">Hora</div>
                    <div className="font-mono-stat text-sm text-[#1A2210]">
                      {r.check_in_hhmm}{r.check_out_hhmm ? ` → ${r.check_out_hhmm}` : ""}
                    </div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full ${r.check_out_hhmm ? "bg-[#5A4A98]" : "bg-emerald-500"}`} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Session modal */}
      {sessionModalOpen && (
        <SessionModal
          session={session}
          saveSession={saveSession}
          parcels={parcels}
          products={products}
          crews={crews}
          onClose={() => setSessionModalOpen(false)}
        />
      )}

      {/* Check-out confirm modal */}
      {confirmCheckout && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !checkingOutAll && setConfirmCheckout(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="confirm-checkout-modal">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#5A4A98]/10 text-[#5A4A98] flex items-center justify-center">
              <Moon className="w-7 h-7" />
            </div>
            <h3 className="font-extrabold text-xl text-center mt-3" style={{ fontFamily: "Outfit, sans-serif" }}>Finalizar jornada</h3>
            <p className="text-center text-sm text-[#556047] font-semibold mt-1">
              Se marcará la salida de <b>{openCount}</b> trabajador(es) con jornada abierta.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirmCheckout(false)}
                disabled={checkingOutAll}
                className="h-12 rounded-xl bg-white border-2 border-[#E2DDD0] text-[#556047] font-bold"
                data-testid="checkout-cancel-button"
              >
                Cancelar
              </button>
              <button
                onClick={checkoutAll}
                disabled={checkingOutAll}
                className="h-12 rounded-xl bg-[#5A4A98] hover:bg-[#453785] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                data-testid="checkout-confirm-button"
              >
                {checkingOutAll ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Moon className="w-5 h-5" /> Salida de todos</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================== Sub-components =========================== */

function Tile({ label, icon, onClick, colorFrom, colorTo, badge, testid }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className="flex flex-col items-center group"
    >
      <div
        className="w-full aspect-square rounded-[22px] flex items-center justify-center text-white shadow-lg active:scale-[0.97] transition-transform relative"
        style={{ background: `linear-gradient(145deg, ${colorFrom}, ${colorTo})` }}
      >
        {icon}
        {badge ? (
          <span className="absolute -top-1.5 -right-1.5 bg-white text-[#1A2210] font-mono-stat text-xs min-w-[24px] h-6 rounded-full px-1.5 flex items-center justify-center shadow-md border-2 border-white">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-white text-sm font-bold text-center" style={{ fontFamily: "Outfit, sans-serif" }}>
        {label}
      </div>
    </button>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-[#E2DDD0] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#889078]">{label}</div>
      <div className="font-mono-stat text-xl" style={{ color }}>{value}</div>
    </div>
  );
}

function SessionModal({ session, saveSession, parcels, products, crews, onClose }) {
  const [parcelId, setParcelId] = useState(session.parcelId || "");
  const [mayordomo, setMayordomo] = useState(session.mayordomo || "");
  const [productId, setProductId] = useState(session.productId || "");
  const canSave = parcelId && mayordomo.trim() && productId;

  const suggestions = Array.from(new Set([
    ...crews.map((c) => c.name).filter(Boolean),
    ...crews.map((c) => c.boss?.name).filter(Boolean),
  ]));

  const confirm = () => {
    if (!canSave) return;
    const matchedCrew = crews.find(
      (c) => c.name?.toLowerCase() === mayordomo.trim().toLowerCase() ||
             c.boss?.name?.toLowerCase() === mayordomo.trim().toLowerCase()
    );
    saveSession({
      parcelId,
      mayordomo: mayordomo.trim(),
      crewId: matchedCrew?.id || "",
      productId,
    });
    toast.success("Sesión guardada");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose} data-testid="session-modal">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-xl" style={{ fontFamily: "Outfit, sans-serif" }}>Antes de empezar</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">
              <MapPin className="w-4 h-4 text-[#E89C3F]" /> Rancho
            </label>
            <select
              value={parcelId}
              onChange={(e) => setParcelId(e.target.value)}
              className="field-input w-full"
              data-testid="session-parcel-select"
            >
              <option value="">— Elige un rancho —</option>
              {parcels.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">
              <UserCircle2 className="w-4 h-4 text-[#E89C3F]" /> Mayordomo / Cuadrilla
            </label>
            <input
              type="text"
              value={mayordomo}
              onChange={(e) => setMayordomo(e.target.value)}
              list="mayordomo-suggestions"
              placeholder="Escribe el nombre del mayordomo"
              className="field-input w-full"
              data-testid="session-mayordomo-input"
              autoComplete="off"
            />
            <datalist id="mayordomo-suggestions">
              {suggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {crews.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {crews.slice(0, 6).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setMayordomo(c.boss?.name || c.name)}
                    className="h-8 px-3 text-xs font-bold rounded-full bg-[#F0EDE1] border border-[#E2DDD0] hover:bg-[#E2DDD0] text-[#1A2210]"
                    data-testid={`crew-suggestion-${c.id}`}
                  >
                    {c.boss?.name || c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">
              <ShoppingBasket className="w-4 h-4 text-[#E89C3F]" /> Trabajo / Producto
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="field-input w-full"
              data-testid="session-product-select"
            >
              <option value="">— Elige un trabajo —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="h-12 rounded-xl bg-white border-2 border-[#E2DDD0] text-[#556047] font-bold"
            data-testid="session-cancel-button"
          >
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={!canSave}
            className="h-12 rounded-xl bg-[#1E4620] hover:bg-[#153417] text-white font-bold disabled:opacity-50"
            data-testid="session-save-button"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================= Check-In Sub-View (Orange) ======================= */
function CheckInView(props) {
  const {
    data, loading, scannerOn, setScannerOn, selectedParcel, selectedProduct, session,
    crews, handleScan, removeAttendance, setManualOpen, setShowCrewPicker,
    goBack, openSummary,
    manualOpen, manualCode, setManualCode, workers, setWorkers, setManualOpen2,
    quickAddOpen, setQuickAddOpen, submitCode, processing,
    showCrewPicker, setShowCrewPicker2, moveCrew,
  } = props;

  return (
    <div className="-mx-4 -my-5 sm:-mx-0 sm:-my-0" data-testid="asistencia-checkin">
      {/* Orange header card */}
      <div className="bg-[#F4B860] px-5 pt-4 pb-5 rounded-b-2xl">
        <div className="flex items-center justify-between text-[#1A2210] mb-3">
          <button onClick={goBack} className="flex items-center gap-1 font-semibold" data-testid="checkin-back-button">
            <ArrowLeft className="w-5 h-5" /> Atrás
          </button>
          <h1 className="text-lg font-extrabold" style={{ fontFamily: "Outfit, sans-serif" }}>Check in</h1>
          <button onClick={openSummary} data-testid="open-summary-button" className="text-sm font-bold text-[#1A2210]">
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

        {/* Session summary chips */}
        <div className="bg-white rounded-xl p-3 grid grid-cols-2 gap-2">
          <div className="bg-[#FDF6EC] rounded-lg px-3 py-2">
            <div className="text-[10px] text-[#889078] font-bold uppercase tracking-wider">Rancho</div>
            <div className="font-bold text-[#1A2210] text-sm truncate">{selectedParcel?.name || "—"}</div>
          </div>
          <div className="bg-[#FDF6EC] rounded-lg px-3 py-2">
            <div className="text-[10px] text-[#889078] font-bold uppercase tracking-wider">Trabajo</div>
            <div className="font-bold text-[#1A2210] text-sm truncate">{selectedProduct?.name || "—"} — Picking</div>
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
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setManualOpen2(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Entrada manual</h3>
              <button onClick={() => setManualOpen2(false)}><X className="w-5 h-5" /></button>
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
                onClick={async () => { await submitCode(manualCode); setManualCode(""); setManualOpen2(false); }}
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
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowCrewPicker2(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Mover cuadrilla</h3>
              <button onClick={() => setShowCrewPicker2(false)}><X className="w-5 h-5" /></button>
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

/* ========================= Summary Sub-View (Blue) ========================= */
function SummaryView({ data, selectedParcel, onClose }) {
  const groupedByLocation = {};
  data.rows.forEach((r) => {
    const key = selectedParcel?.name || "Sin ubicación";
    if (!groupedByLocation[key]) groupedByLocation[key] = [];
    groupedByLocation[key].push(r);
  });
  const totalWorkers = data.rows.length;

  return (
    <div className="min-h-[calc(100vh-5rem)] -mx-4 -my-5 sm:-mx-0 sm:-my-0" data-testid="crew-summary-view">
      <div className="bg-[#1e40af] text-white px-5 pt-5 pb-6 rounded-b-xl">
        <div className="flex items-center justify-between mb-5">
          <button onClick={onClose} className="flex items-center gap-1" data-testid="close-summary">
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

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-xs text-[#556047] font-semibold">{label}</div>
      <div className="font-mono-stat text-3xl text-[#1A2210] mt-1">{value}</div>
    </div>
  );
}
