import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera, CameraOff, Keyboard, Users, Loader2, X, ArrowLeft, UserPlus,
  Search, Sun, Moon, CloudCheck, ChevronRight, MapPin, UserCircle2, LogOut,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { confirmAction } from "@/lib/confirm";
import api, { formatApiErrorDetail, formatCurrency, formatNumber, todayISO, formatHHMM, fetchCheckinSession, saveCheckinSession } from "@/lib/api";
import QrScanner from "@/components/QrScanner";
import QuickAddWorker from "@/components/QuickAddWorker";
import { HubRow, AttendanceRow, ManualWorkerRow, Tile, MiniStat, SummaryCell, SummaryView, usePaged, ShowMore, PAGE_SIZE } from "@/components/asistencia/AsistenciaParts";

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
  const [harvestsToday, setHarvestsToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Session (persisted in localStorage per-date)
  const [session, setSession] = useState(() => loadSession(todayISO()));
  const [sessionVersion, setSessionVersion] = useState(0);
  useEffect(() => {
    fetchCheckinSession(date).then((s) => {
      if (s && Object.keys(s).length) { setSession(s); setSessionVersion((v) => v + 1); }
    });
    // eslint-disable-next-line
  }, []);

  // Check-in sub-view state
  const [scannerOn, setScannerOn] = useState(false);
  const [showCrewPicker, setShowCrewPicker] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualSelected, setManualSelected] = useState(() => new Set());
  const [manualSearch, setManualSearch] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [confirmCheckout, setConfirmCheckout] = useState(false);
  const [checkingOutAll, setCheckingOutAll] = useState(false);
  const [showCheckoutMenu, setShowCheckoutMenu] = useState(false);
  const lastScanRef = useRef({ code: "", at: 0 });

  const saveSession = (patch) => {
    const next = { ...session, ...patch };
    setSession(next);
    try { localStorage.setItem(SESSION_KEY(date), JSON.stringify(next)); } catch (_) {}
    saveCheckinSession(next);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [a, w, p, pr, c, h] = await Promise.all([
        api.get("/attendance", { params: { date } }),
        api.get("/workers"),
        api.get("/parcels"),
        api.get("/products"),
        api.get("/crews"),
        api.get("/harvests", { params: { date_from: date, date_to: date } }),
      ]);
      setData(a.data);
      setWorkers(w.data);
      setParcels(p.data);
      setProducts(pr.data);
      setCrews(c.data);
      setHarvestsToday(h.data || []);
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
  const openCount = data.rows.filter((r) => !r.check_out).length;
  const presentWorkerIds = useMemo(() => new Set(data.rows.map((r) => r.worker_id)), [data.rows]);
  const workerMap = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const hubPage = usePaged(data.rows, [data.rows.length]);

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
      if (res.action === "check_in") toast.success(`✅ Entrada: ${res.worker_name} • ${formatHHMM(res.check_in)}`);
      else if (res.action === "check_out") toast.success(`🏁 Salida: ${res.worker_name} • ${formatHHMM(res.check_out)} (${res.hours}h)`);
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
    if (!(await confirmAction("¿Eliminar este registro?", "Eliminar"))) return;
    try { await api.delete(`/attendance/${id}`); toast.success("Eliminado"); load(); }
    catch (e) { toast.error("No se pudo eliminar"); }
  };
  const actionsRef = useRef({});
  actionsRef.current = { submitCode, removeAttendance };
  const onRowCheckout = useCallback((code) => actionsRef.current.submitCode(code), []);
  const onRowDelete = useCallback((id) => actionsRef.current.removeAttendance(id), []);

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
    const open = data.rows.filter((r) => !r.check_out);
    if (open.length === 0) {
      toast.info("No hay empleados con jornada abierta");
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
    setView("checkin");
  };


  const onCheckOut = () => {
    // Go to the attendance list where each worker has an individual "Salida" button
    if (presentCount === 0) {
      toast.info("Aún no hay empleados con entrada");
      return;
    }
    setView("checkout");
  };

  // ============== End-of-day summary + reset ==============
  const [endDayOpen, setEndDayOpen] = useState(false);
  const [endDaySummary, setEndDaySummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [closingDay, setClosingDay] = useState(false);

  const openEndDay = async () => {
    setLoadingSummary(true);
    setEndDayOpen(true);
    try {
      const [daily, att] = await Promise.all([
        api.get("/harvests/daily", { params: { date } }),
        api.get("/attendance", { params: { date } }),
      ]);
      const h = daily.data || {};
      const a = att.data || {};
      setEndDaySummary({
        harvests: h.harvest_count || h.harvests_count || h.total_harvests || (h.rows || []).length || 0,
        workers: h.worker_count || h.workers_count || new Set((h.rows || []).map((r) => r.worker_id)).size || 0,
        kilos: h.total_kilos || 0,
        units: h.total_units || 0,
        payment: h.total_payment || h.payment_total || 0,
        attendance: a.rows?.length || 0,
        total_hours: a.total_hours || 0,
      });
    } catch (_) {
      setEndDaySummary({ harvests: 0, workers: 0, payment: 0, attendance: 0, total_hours: 0 });
    } finally {
      setLoadingSummary(false);
    }
  };

  const confirmEndDay = async () => {
    setClosingDay(true);
    try {
      // Close any still-open attendance in bulk
      const openRows = data.rows.filter((r) => !r.check_out);
      for (const r of openRows) {
        try { await api.post("/attendance/scan", { code: r.worker_id, date }); } catch (_) {}
      }
      toast.success("✅ Día cerrado. Los registros quedaron guardados.");
      setEndDayOpen(false);
      await load();
    } finally {
      setClosingDay(false);
    }
  };

  // ============== VIEWS ==============
  if (view === "summary") return (
    <SummaryView
      data={data}
      selectedParcel={selectedParcel}
      harvestsToday={harvestsToday}
      date={date}
      onClose={() => setView("checkin")}
    />
  );

  if (view === "checkin" || view === "checkout") return (
    <CheckInView
      key={`${view}-${sessionVersion}`}
      mode={view}
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
      removeAttendance={onRowDelete}
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
      manualSelected={manualSelected}
      setManualSelected={setManualSelected}
      manualSearch={manualSearch}
      setManualSearch={setManualSearch}
      manualSubmitting={manualSubmitting}
      setManualSubmitting={setManualSubmitting}
      showCheckoutMenu={showCheckoutMenu}
      setShowCheckoutMenu={setShowCheckoutMenu}
      openCount={openCount}
      setConfirmCheckout={setConfirmCheckout}
      setView={setView}
      setParcels={setParcels}
      setProducts={setProducts}
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
            onClick={() => navigate("/registrar")}
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

        {/* Three Tiles */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 max-w-sm mx-auto">
          <Tile
            testid="tile-check-in"
            label="Check in"
            onClick={onCheckIn}
            colorFrom="#60A5FA"
            colorTo="#2563EB"
            icon={<Sun className="w-9 h-9" strokeWidth={2.3} />}
            badge={presentCount > 0 ? presentCount : null}
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

        {/* End of day */}
        <button
          onClick={openEndDay}
          className="mt-4 w-full h-12 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-sm flex items-center justify-center gap-2"
          data-testid="end-day-button"
        >
          🏁 Finalizar día · ver resumen y reiniciar
        </button>
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
          <MiniStat label="Entrada" value={presentCount} color="#2563EB" />
          <MiniStat label="En campo" value={openCount} color="#1D4ED8" />
          <MiniStat label="Salida" value={presentCount - openCount} color="#DC2626" />
        </div>

        {loading ? (
          <div className="flex justify-center py-8 text-[#1D4ED8]"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : data.rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2DDD0] py-10 text-center" data-testid="hub-empty">
            <p className="text-[#889078] font-semibold">No piece work today.</p>
            <p className="text-xs text-[#889078] mt-1">Toca <b>Check in</b> para registrar entradas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {hubPage.visible.map((r) => {
              const w = workerMap.get(r.worker_id);
              return (
                <HubRow
                  key={r.id}
                  r={r}
                  shortId={(w?.id_document || w?.id || "").toString().slice(-3) || "—"}
                  checkoutCode={w?.qr_code || w?.id || r.worker_id}
                  processing={processing}
                  onCheckout={onRowCheckout}
                />
              );
            })}
            <ShowMore remaining={hubPage.remaining} onClick={hubPage.more} testid="hub-show-more" />
          </div>
        )}
      </div>

      {/* End-of-day modal */}
      {endDayOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !closingDay && setEndDayOpen(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="end-day-modal">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#1D4ED8]/10 text-[#1D4ED8] flex items-center justify-center text-2xl">🏁</div>
            <h3 className="font-extrabold text-xl text-center mt-3" style={{ fontFamily: "Outfit, sans-serif" }}>Resumen del día</h3>
            <p className="text-center text-sm text-[#556047] font-semibold mt-1">{prettyDate}</p>

            {loadingSummary || !endDaySummary ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8]" /></div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <SummaryCell label="Empleados" value={endDaySummary.attendance} />
                  <SummaryCell label="Cosechas" value={endDaySummary.harvests} />
                  <SummaryCell label="Piezas" value={formatNumber(endDaySummary.units, 0)} />
                  <SummaryCell label="Horas" value={formatNumber(endDaySummary.total_hours, 2)} />
                </div>
                <div className="mt-3 rounded-2xl bg-[#DC2626] text-white p-4 flex items-center justify-between">
                  <div className="text-sm font-bold">Pago total del día</div>
                  <div className="font-mono-stat text-2xl">{formatCurrency(endDaySummary.payment)}</div>
                </div>
                <div className="mt-3 text-xs text-[#556047] font-semibold bg-[#F7F5EE] rounded-xl p-3">
                  ✅ Todos los registros ya están guardados.<br />
                  Al confirmar, se cerrarán las jornadas abiertas. Rancho, Block, Trabajo, Variedad y Precio se quedan guardados hasta que borres el historial.
                </div>
              </>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setEndDayOpen(false)}
                disabled={closingDay}
                className="h-12 rounded-xl bg-white border-2 border-[#E2DDD0] text-[#556047] font-bold"
                data-testid="end-day-cancel"
              >
                Cancelar
              </button>
              <button
                onClick={confirmEndDay}
                disabled={closingDay || loadingSummary}
                className="h-12 rounded-xl bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                data-testid="end-day-confirm"
              >
                {closingDay ? <Loader2 className="w-5 h-5 animate-spin" /> : <>🏁 Cerrar día</>}
              </button>
            </div>
          </div>
        </div>
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
              Se marcará la salida de <b>{openCount}</b> empleado(s) con jornada abierta.
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

/* ======================= Check-In Sub-View (Orange) ======================= */
function CheckInView(props) {
  const {
    data, loading, scannerOn, setScannerOn, selectedParcel, selectedProduct, session, saveSession,
    parcels, products, setParcels, setProducts,
    crews, handleScan, removeAttendance, setManualOpen, setShowCrewPicker,
    goBack, openSummary,
    manualOpen, manualCode, setManualCode, workers, setWorkers, setManualOpen2,
    quickAddOpen, setQuickAddOpen, submitCode, processing,
    showCrewPicker, setShowCrewPicker2, moveCrew,
    manualSelected, setManualSelected, manualSearch, setManualSearch,
    manualSubmitting, setManualSubmitting,
    showCheckoutMenu, setShowCheckoutMenu, openCount, setConfirmCheckout, setView, mode,
  } = props;
  const isOut = mode === "checkout";
  const listRows = useMemo(() => (isOut ? data.rows.filter((r) => r.check_out).sort((a, b) => String(b.check_out).localeCompare(String(a.check_out))) : data.rows), [isOut, data.rows]);
  const openByCode = useMemo(() => {
    const m = new Map();
    data.rows.filter((r) => r.check_in && !r.check_out).forEach((r) => {
      const w = (workers || []).find((x) => x.id === r.worker_id);
      [r.worker_id, w?.qr_code, w?.id_document].filter(Boolean).forEach((c) => m.set(String(c), w?.qr_code || r.worker_id));
    });
    return m;
  }, [data.rows, workers]);
  const onScanCode = (code) => {
    if (!isOut) return requireFields(handleScan)(code);
    if (!openByCode.has(String(code))) { toast.error("Este empleado no tiene entrada abierta"); return; }
    handleScan(openByCode.get(String(code)));
  };
  const [unitMode, setUnitMode] = useState(session?.unitMode || "pieza"); // "pieza" | "libra" | "horas"
  const attPage = usePaged(listRows, [listRows.length]);
  const [manualLimit, setManualLimit] = useState(PAGE_SIZE);
  const place = `${selectedParcel?.name || "—"}, ${selectedProduct?.name || "—"}`;

  // Inline draft state for every editable field in the header
  const [draftMayordomo, setDraftMayordomo] = useState(session?.mayordomo || "");
  const [draftRancho, setDraftRancho] = useState(
    (parcels || []).find((p) => p.id === session?.parcelId)?.name || session?.ranchoName || ""
  );
  const [draftBlock, setDraftBlock] = useState(session?.block || "");
  const [draftGrower, setDraftGrower] = useState(session?.grower || "");
  const [draftTrabajo, setDraftTrabajo] = useState(
    (products || []).find((p) => p.id === session?.productId)?.name || session?.trabajoName || ""
  );
  const [draftVariedad, setDraftVariedad] = useState(session?.variedad || "");
  const [draftPricePerUnit, setDraftPricePerUnit] = useState(
    session?.pricePerUnit != null && session?.pricePerUnit !== "" ? String(session.pricePerUnit) : ""
  );
  const [draftPricePerHour, setDraftPricePerHour] = useState(
    session?.pricePerHour != null && session?.pricePerHour !== "" ? String(session.pricePerHour) : ""
  );

  // Persist helpers (localStorage via saveSession prop)
  const commitMayordomo = () => {
    const name = (draftMayordomo || "").trim();
    const matched = (crews || []).find(
      (c) => c.name?.toLowerCase() === name.toLowerCase() ||
             c.boss?.name?.toLowerCase() === name.toLowerCase()
    );
    saveSession?.({ mayordomo: name, crewId: matched?.id || "" });
  };
  const commitGrower = () => {
    saveSession?.({ grower: (draftGrower || "").trim() });
  };
  const commitBlock = () => {
    saveSession?.({ block: (draftBlock || "").trim() });
  };
  const commitVariedad = () => {
    saveSession?.({ variedad: (draftVariedad || "").trim() });
  };
  const commitPricePerUnit = () => {
    const raw = (draftPricePerUnit || "").trim();
    saveSession?.({ pricePerUnit: raw === "" ? "" : Number(raw) });
  };
  const commitPricePerHour = () => {
    const raw = (draftPricePerHour || "").trim();
    saveSession?.({ pricePerHour: raw === "" ? "" : Number(raw) });
  };
  const commitRancho = async () => {
    const name = (draftRancho || "").trim();
    if (!name) { saveSession?.({ parcelId: "", ranchoName: "" }); return; }
    let parcel = (parcels || []).find((p) => p.name?.toLowerCase() === name.toLowerCase());
    if (!parcel) {
      try {
        const { data } = await api.post("/parcels", { name });
        parcel = data;
        setParcels?.((prev) => [...(prev || []), data]);
      } catch (e) {
        toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo guardar el rancho");
        return;
      }
    }
    saveSession?.({ parcelId: parcel.id, ranchoName: parcel.name });
  };
  const commitTrabajo = async () => {
    const name = (draftTrabajo || "").trim();
    if (!name) { saveSession?.({ productId: "", trabajoName: "" }); return; }
    let product = (products || []).find((p) => p.name?.toLowerCase() === name.toLowerCase());
    if (!product) {
      try {
        const { data } = await api.post("/products", { name });
        product = data;
        setProducts?.((prev) => [...(prev || []), data]);
      } catch (e) {
        toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo guardar el trabajo");
        return;
      }
    }
    saveSession?.({ productId: product.id, trabajoName: product.name });
  };

  // Required fields before allowing any check-in
  const [showErrors, setShowErrors] = useState(false);
  const priceDraft = unitMode === "horas" ? draftPricePerHour : draftPricePerUnit;
  const missing = {
    rancho: !draftRancho.trim(),
    block: !draftBlock.trim(),
    trabajo: !draftTrabajo.trim(),
    variedad: !draftVariedad.trim(),
    precio: !(Number(priceDraft) > 0),
  };
  const missingLabels = { rancho: "Rancho", block: "Block", trabajo: "Trabajo", variedad: "Variedad", precio: unitMode === "horas" ? "Precio / hora" : "Precio" };
  const requireFields = (fn) => (...args) => {
    const list = isOut ? [] : Object.keys(missing).filter((k) => missing[k]);
    if (list.length) {
      setShowErrors(true);
      if (scannerOn) setScannerOn(false);
      toast.error(`Completa primero: ${list.map((k) => missingLabels[k]).join(", ")}`);
      return;
    }
    return fn(...args);
  };

  // Shared classes for the inline field cards
  const cardCls = "bg-white rounded-2xl p-2 grid grid-cols-2 gap-1.5";
  const baseCellCls = "bg-[#F3F4F6] rounded-lg px-2.5 py-1.5 min-w-0";
  const cellFor = (k) => `${baseCellCls} ${showErrors && missing[k] ? "ring-2 ring-red-500 bg-red-50" : ""}`;
  const cellCls = baseCellCls;
  const labelCls = "text-[9px] text-[#889078] font-bold uppercase tracking-wider";
  const inputCls = "w-full bg-transparent border-0 outline-none font-bold text-[#1A2210] text-xs truncate p-0 focus:ring-0";

  return (
    <div className="-mx-4 -my-5 sm:-mx-0 sm:-my-0" data-testid="asistencia-checkin">
      {/* Blue header */}
      <div className={`${isOut ? "bg-[#5A4A98]" : "bg-[#2563EB]"} px-5 pt-4 pb-5 rounded-b-2xl text-white`}>
        {/* Top row: Atrás · Check in · Resumen */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={goBack} className="flex items-center gap-1 font-semibold" data-testid="checkin-back-button">
            <ArrowLeft className="w-5 h-5" /> Atrás
          </button>
          <h1 className="text-xl font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }} data-testid="checkin-title">{isOut ? "Check out" : "Check in"}</h1>
          <button onClick={openSummary} data-testid="open-summary-button" className="text-base font-bold">
            Resumen
          </button>
        </div>

        {/* Row: CHECKED IN counter + controls */}
        <div className="flex items-start gap-3 mb-4">
          {/* Left: CHECKED IN counter */}
          <div className="shrink-0 min-w-[76px]">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#1A2210]/70">{isOut ? "Checked out" : "Checked in"}</div>
            <div className="font-mono-stat text-5xl text-[#1A2210] leading-none mt-1" data-testid="checkin-count">{listRows.length}</div>
          </div>

          {/* Mayordomo pill + keyboard + camera */}
          <div className={`flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 ${isOut ? "justify-start" : "justify-end"}`}>
            <button
              onClick={requireFields(() => setManualOpen(true))}
              className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm text-[#1A2210] shrink-0"
              title="Teclado"
              data-testid="manual-open-button"
            >
              <Keyboard className="w-5 h-5" />
            </button>
            <button
              onClick={scannerOn ? () => setScannerOn(false) : requireFields(() => setScannerOn(true))}
              className={`w-11 h-11 rounded-full flex items-center justify-center shadow-sm shrink-0 ${scannerOn ? "bg-red-100 text-red-700" : "bg-white text-[#1A2210]"}`}
              title={scannerOn ? "Detener" : "Escanear"}
              data-testid="toggle-scanner-button"
            >
              {scannerOn ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
            </button>
          </div>

          {/* Right: Pieza / libra / Horas unit toggle */}
          {!isOut && <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {[
              { k: "pieza", l: "Pieza" },
              { k: "libra", l: "Libra" },
              { k: "horas", l: "Horas" },
            ].map(({ k, l }) => (
              <button
                key={k}
                onClick={() => { setUnitMode(k); saveSession?.({ unitMode: k }); }}
                className={`h-10 sm:h-11 px-2.5 sm:px-3 rounded-full text-xs sm:text-sm font-extrabold transition shadow-sm ${
                  unitMode === k ? "bg-[#1A2210] text-white" : "bg-white text-[#1A2210] hover:bg-[#F0F0F0]"
                }`}
                data-testid={`checkin-unit-${k}`}
              >
                {l}
              </button>
            ))}
          </div>}
        </div>

        <div className="flex items-center gap-2 mb-4">
          {!isOut && <button
            onClick={requireFields(() => crews.length > 0 ? setShowCrewPicker(true) : toast.info("Primero crea una cuadrilla en Módulos"))}
            className="h-10 bg-white text-[#1A2210] px-4 rounded-full text-sm font-bold flex items-center gap-1.5 shadow-sm"
            data-testid="move-crew-button"
          >
            <Users className="w-4 h-4" /> Move Crew
          </button>}
          <div className="relative">
            <button
              onClick={() => setShowCheckoutMenu((v) => !v)}
              className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-[#DC2626]"
              title="Salida"
              data-testid="checkout-menu-button"
            >
              <LogOut className="w-5 h-5" />
            </button>
            {showCheckoutMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowCheckoutMenu(false)} />
                <div className="absolute left-0 top-12 w-56 bg-white rounded-2xl shadow-xl border border-[#E2DDD0] overflow-hidden z-30">
                  <button
                    onClick={() => {
                      setShowCheckoutMenu(false);
                      if (openCount === 0) { toast.info("No hay empleados con jornada abierta"); return; }
                      setConfirmCheckout(true);
                    }}
                    className="w-full text-left px-4 py-3 text-sm font-bold text-[#1A2210] hover:bg-[#F7F5EE] flex items-center gap-2 border-b border-[#F0EDE1]"
                    data-testid="checkout-all-option"
                  >
                    <Moon className="w-4 h-4 text-[#5A4A98]" /> Salida a todos
                  </button>
                  <button
                    onClick={() => {
                      setShowCheckoutMenu(false);
                      if (openCount === 0) { toast.info("No hay empleados con jornada abierta"); return; }
                      setView("hub");
                      setTimeout(() => {
                        document.querySelector('[data-testid^="hub-checkout-"]')?.scrollIntoView({ behavior: "auto", block: "nearest" });
                      }, 100);
                    }}
                    className="w-full text-left px-4 py-3 text-sm font-bold text-[#1A2210] hover:bg-[#F7F5EE] flex items-center gap-2"
                    data-testid="checkout-individual-option"
                  >
                    <UserCircle2 className="w-4 h-4 text-[#DC2626]" /> Salida individual
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row of cards: Left=Rancho/Block, Right=Trabajo/Variedad + Precio stacked — all inline editable */}
        <div className="grid grid-cols-2 gap-2 items-start">
          {/* Left column: Rancho + Block */}
          <div className={cardCls} data-testid="checkin-rancho-row">
            <div className={cellFor("rancho")}>
              <div className={labelCls}>Rancho *</div>
              <input
                type="text"
                value={draftRancho}
                onChange={(e) => setDraftRancho(e.target.value)}
                onBlur={commitRancho}
                list="checkin-rancho-list"
                placeholder="—"
                className={inputCls}
                data-testid="checkin-rancho-input"
                autoComplete="off"
              />
              <datalist id="checkin-rancho-list">
                {(parcels || []).map((p) => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>
            <div className={cellFor("block")}>
              <div className={labelCls}>Block *</div>
              <input
                type="text"
                value={draftBlock}
                onChange={(e) => setDraftBlock(e.target.value)}
                onBlur={commitBlock}
                placeholder="—"
                className={inputCls}
                data-testid="checkin-block-input"
                autoComplete="off"
              />
            </div>
            <div className={cellCls}>
              <div className={labelCls}>Mayordomo</div>
              <input
                type="text"
                value={draftMayordomo}
                onChange={(e) => setDraftMayordomo(e.target.value)}
                onBlur={commitMayordomo}
                placeholder="—"
                className={inputCls}
                data-testid="checkin-mayordomo-input"
                autoComplete="off"
              />
            </div>
            <div className={cellCls}>
              <div className={labelCls}>Grower</div>
              <input
                type="text"
                value={draftGrower}
                onChange={(e) => setDraftGrower(e.target.value)}
                onBlur={commitGrower}
                placeholder="—"
                className={inputCls}
                data-testid="checkin-grower-input"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Right column: Trabajo/Variedad + Precio stacked */}
          <div className="flex flex-col gap-2">
            <div className={cardCls} data-testid="checkin-trabajo-row">
              <div className={cellFor("trabajo")}>
                <div className={labelCls}>Trabajo *</div>
                <input
                  type="text"
                  value={draftTrabajo}
                  onChange={(e) => setDraftTrabajo(e.target.value)}
                  onBlur={commitTrabajo}
                  list="checkin-trabajo-list"
                  placeholder="—"
                  className={inputCls}
                  data-testid="checkin-trabajo-input"
                  autoComplete="off"
                />
                <datalist id="checkin-trabajo-list">
                  {(products || []).map((p) => <option key={p.id} value={p.name} />)}
                </datalist>
              </div>
              <div className={cellFor("variedad")}>
                <div className={labelCls}>Variedad *</div>
                <input
                  type="text"
                  value={draftVariedad}
                  onChange={(e) => setDraftVariedad(e.target.value)}
                  onBlur={commitVariedad}
                  placeholder="—"
                  className={inputCls}
                  data-testid="checkin-variedad-input"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className={cardCls} data-testid="checkin-precio-row">
              <div className={unitMode === "horas" ? cellCls : cellFor("precio")}>
                <div className={labelCls}>Precio{unitMode !== "horas" ? " *" : ""}</div>
                <div className="flex items-center">
                  <span className="text-[#889078] font-bold text-xs mr-0.5">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={draftPricePerUnit}
                    onChange={(e) => setDraftPricePerUnit(e.target.value)}
                    onBlur={commitPricePerUnit}
                    placeholder="0.00"
                    className={`${inputCls} font-mono-stat`}
                    data-testid="checkin-price-unit-input"
                  />
                </div>
              </div>
              <div className={unitMode === "horas" ? cellFor("precio") : cellCls}>
                <div className={labelCls}>Precio / hora{unitMode === "horas" ? " *" : ""}</div>
                <div className="flex items-center">
                  <span className="text-[#889078] font-bold text-xs mr-0.5">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={draftPricePerHour}
                    onChange={(e) => setDraftPricePerHour(e.target.value)}
                    onBlur={commitPricePerHour}
                    placeholder="0.00"
                    className={`${inputCls} font-mono-stat`}
                    data-testid="checkin-price-hour-input"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scanner area */}
      {scannerOn && (
        <div className="px-4 mt-4">
          <QrScanner active={scannerOn} onScan={onScanCode} />
        </div>
      )}

      {/* Attendance list */}
      <div className="px-4 mt-4 space-y-2 pb-6">
        {loading ? (
          <div className="flex justify-center py-6 text-[#1D4ED8]"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : listRows.length === 0 ? (
          <p className="text-center text-[#556047] font-semibold py-6" data-testid="attendance-empty">
            {isOut ? "Aún no hay salidas registradas hoy" : "Aún no hay empleados registrados hoy"}
          </p>
        ) : (
          <>
            {attPage.visible.map((r) => <AttendanceRow key={r.id} r={r} place={place} checkout={isOut} onDelete={isOut ? null : removeAttendance} />)}
            <ShowMore remaining={attPage.remaining} onClick={attPage.more} testid="attendance-show-more" />
          </>
        )}
      </div>

      {/* Manual entry modal */}
      {manualOpen && (() => {
        const checkedInIds = new Set((data?.rows || []).filter((r) => r.check_in).map((r) => String(r.worker_id)));
        const openIds = new Set((data?.rows || []).filter((r) => r.check_in && !r.check_out).map((r) => String(r.worker_id)));
        const needle = (manualSearch || "").trim().toLowerCase();
        const eligible = (workers || []).filter((w) => (isOut ? openIds.has(String(w.id)) : !checkedInIds.has(String(w.id))));
        const list = needle ? eligible.filter((w) => (w.name || "").toLowerCase().includes(needle)) : eligible;
        const allSelected = list.length > 0 && list.every((w) => manualSelected.has(w.id));
        const toggleAll = () => {
          const next = new Set(manualSelected);
          if (allSelected) list.forEach((w) => next.delete(w.id));
          else list.forEach((w) => next.add(w.id));
          setManualSelected(next);
        };
        const closeModal = () => {
          setManualOpen2(false);
          setManualSelected(new Set());
          setManualSearch("");
        };
        const markSelected = async () => {
          if (manualSelected.size === 0) return;
          setManualSubmitting(true);
          try {
            const ids = [...manualSelected];
            for (const id of ids) {
              const w = (workers || []).find((x) => x.id === id);
              const code = w?.qr_code || id;
              try { await submitCode(code); } catch (_) {}
            }
          } finally {
            setManualSubmitting(false);
            closeModal();
          }
        };
        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={closeModal}>
            <div className="bg-white rounded-t-3xl sm:rounded-3xl p-5 w-full sm:max-w-md shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-extrabold text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>{isOut ? "Salida" : "Entrada"}</h3>
                <button onClick={closeModal} data-testid="manual-close"><X className="w-5 h-5" /></button>
              </div>
              <input
                type="text"
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
                placeholder="Buscar empleado…"
                className="field-input !h-11 !text-base w-full mb-2"
                data-testid="manual-search-input"
              />
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="h-9 px-3 rounded-lg bg-[#F0EDE1] hover:bg-[#E2DDD0] text-[#1A2210] text-xs font-extrabold uppercase tracking-wider"
                  data-testid="manual-toggle-all"
                >
                  {allSelected ? "Quitar todos" : "Seleccionar todos"}
                </button>
                <span className="text-xs text-[#556047] font-bold font-mono-stat">
                  {manualSelected.size} / {list.length}
                </span>
              </div>
              <ul className="flex-1 overflow-y-auto divide-y divide-[#E2DDD0] -mx-1 border border-[#E2DDD0] rounded-xl" data-testid="manual-worker-list">
                {list.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-[#556047] font-semibold">
                    {eligible.length === 0 ? (isOut ? "No hay empleados con jornada abierta." : "Todos los empleados ya tienen entrada hoy.") : "Sin coincidencias."}
                  </li>
                ) : list.slice(0, manualLimit).map((w) => (
                  <ManualWorkerRow key={w.id} w={w} selected={manualSelected.has(w.id)} setSelected={setManualSelected} />
                ))}
                {list.length > manualLimit && (
                  <li><button onClick={() => setManualLimit((l) => l + PAGE_SIZE)} className="w-full py-3 text-[#1D4ED8] font-bold text-sm" data-testid="manual-show-more">Ver más ({list.length - manualLimit})</button></li>
                )}
              </ul>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setQuickAddOpen(true)}
                  className="flex-1 h-11 bg-white border-2 border-[#1D4ED8] text-[#1D4ED8] font-bold rounded-xl flex items-center justify-center gap-1.5"
                  data-testid="asist-quick-add-button"
                >
                  <UserPlus className="w-4 h-4" /> Nuevo
                </button>
                <button
                  onClick={markSelected}
                  disabled={manualSelected.size === 0 || manualSubmitting || processing}
                  className="flex-[1.4] h-11 bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-extrabold rounded-xl disabled:opacity-50 flex items-center justify-center gap-1.5"
                  data-testid="manual-submit-button"
                >
                  {manualSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Marcar{manualSelected.size > 0 ? ` (${manualSelected.size})` : ""}</>}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Crew picker modal */}
      {showCrewPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowCrewPicker2(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Mover cuadrilla</h3>
              <button onClick={() => setShowCrewPicker2(false)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-[#556047] mb-3 font-semibold">Registra la entrada de todos los empleados de una cuadrilla</p>
            <div className="space-y-2 max-h-80 overflow-auto">
              {crews.map((c) => (
                <button
                  key={c.id}
                  onClick={() => moveCrew(c)}
                  className="w-full text-left bg-[#F7F5EE] border-2 border-[#E2DDD0] hover:border-[#1D4ED8] rounded-xl p-3"
                  data-testid={`move-crew-${c.id}`}
                >
                  <div className="font-bold text-[#1A2210]">{c.name}</div>
                  <div className="text-xs text-[#556047] font-semibold mt-0.5">
                    {c.boss?.name ? `Jefe: ${c.boss.name} • ` : ""}{c.worker_count} empleado(s)
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

