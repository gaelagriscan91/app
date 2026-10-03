import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Camera, CameraOff, ScanLine, Minus, Plus, Save, Loader2,
  Play, RotateCcw, UserCheck, Package, Users, Clock, DollarSign, Lock,
  CheckCircle2, X,
} from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, formatNumber, formatApiErrorDetail, todayISO } from "@/lib/api";
import QrScanner from "@/components/QrScanner";

/**
 * Scan-per-unit mode:
 * Setup once (parcel + product + date + price_per_unit), then every QR scan
 * increments that worker's unit count. "Guardar" posts one harvest per worker.
 */
export default function ScanHarvestMode() {
  const navigate = useNavigate();
  const [urlParams] = useSearchParams();
  const autoFromCheckin = Boolean(urlParams.get("parcel") && urlParams.get("product"));

  const [workers, setWorkers] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [products, setProducts] = useState([]);

  const [parcelId, setParcelId] = useState(urlParams.get("parcel") || "");
  const [productId, setProductId] = useState(urlParams.get("product") || "");
  const [date, setDate] = useState(todayISO());
  const [pricePerUnit, setPricePerUnit] = useState("");

  const [started, setStarted] = useState(autoFromCheckin);
  const [scannerOn, setScannerOn] = useState(autoFromCheckin);
  const [tally, setTally] = useState({}); // { worker_id: {name, count, pieces:[]} }
  const [saving, setSaving] = useState(false);
  const [scanMode, setScanMode] = useState("worker"); // "worker" | "piece"
  const [activeWorkerId, setActiveWorkerId] = useState("");
  const lastRef = useRef({ code: "", at: 0 });

  // Pay mode: "piece" (count * price_per_piece) | "hour" (hours_worked * price_per_hour)
  const [payMode, setPayMode] = useState("piece");
  const [pricePerHour, setPricePerHour] = useState("");
  const [attendance, setAttendance] = useState({ rows: [] });

  // Share mode: when ON, scans accumulate into a buffer; "Confirmar pieza" distributes 1/N
  const [shareMode, setShareMode] = useState(false);
  const [shareBuffer, setShareBuffer] = useState([]); // [{id, name}]

  useEffect(() => {
    (async () => {
      try {
        const [w, p, pr] = await Promise.all([
          api.get("/workers"),
          api.get("/parcels"),
          api.get("/products"),
        ]);
        setWorkers(w.data.filter((x) => x.active !== false));
        setParcels(p.data.filter((x) => x.active !== false));
        setProducts(pr.data.filter((x) => x.active !== false));
      } catch (_) {
        toast.error("No se pudieron cargar los módulos");
      }
    })();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [productId, products]
  );
  const unitLabel = selectedProduct?.unit_label || "unidad";
  const weightLabel = (selectedProduct?.weight_unit === "lb") ? "Lb" : "Kg";
  const normalizeCode = (s) => (s || "").toString().trim().toUpperCase();
  const extractCode = (raw) => {
    const s = (raw || "").toString().trim();
    // If it looks like a URL or scheme (agriscan://worker/CODE or https://x/w/CODE), take last segment
    if (s.includes("/")) return s.split("/").filter(Boolean).pop();
    if (s.includes(":")) return s.split(":").pop();
    return s;
  };
  const workersByQr = useMemo(() => {
    const map = {};
    workers.forEach((w) => {
      if (w.qr_code) map[normalizeCode(w.qr_code)] = w;
      if (w.id) map[normalizeCode(w.id)] = w;
      if (w.document_id) map[normalizeCode(w.document_id)] = w;
    });
    return map;
  }, [workers]);

  useEffect(() => {
    if (selectedProduct) {
      // Pre-fill prices from product so once set they persist across sessions
      const pu = Number(selectedProduct.price_per_unit) || 0;
      const ph = Number(selectedProduct.price_per_hour) || 0;
      if (pu > 0) setPricePerUnit(String(pu));
      if (ph > 0) setPricePerHour(String(ph));
    }
  }, [selectedProduct]);

  // Lock state: true when the product already has a non-zero price saved (admin can't accidentally zero it)
  const pieceLocked = Number(selectedProduct?.price_per_unit) > 0;
  const hourLocked = Number(selectedProduct?.price_per_hour) > 0;

  // When pay mode = "hour", fetch today's attendance to compute hours per worker
  useEffect(() => {
    if (!started || payMode !== "hour") return;
    (async () => {
      try {
        const { data } = await api.get("/attendance", { params: { date } });
        setAttendance(data);
      } catch (_) {
        toast.error("No se pudo cargar asistencia");
      }
    })();
  }, [started, payMode, date]);

  // Totals for "hour" pay mode come from attendance rows
  const hourTotals = useMemo(() => {
    const price = parseFloat(pricePerHour) || 0;
    const rows = (attendance.rows || []).map((r) => ({
      id: r.id,
      worker_id: r.worker_id,
      name: r.worker_name,
      hours: parseFloat(r.hours) || 0,
      check_in: r.check_in_hhmm,
      check_out: r.check_out_hhmm,
      payment: (parseFloat(r.hours) || 0) * price,
    }));
    const totalHours = rows.reduce((a, r) => a + r.hours, 0);
    const totalPay = rows.reduce((a, r) => a + r.payment, 0);
    return { rows, totalHours, totalPay, workers: rows.length };
  }, [attendance, pricePerHour]);

  const startSession = () => {
    if (!parcelId || !productId) {
      toast.error("Selecciona parcela y producto para iniciar");
      return;
    }
    setStarted(true);
    setScannerOn(true);
  };

  const resetSession = () => {
    if (Object.keys(tally).length > 0 && !window.confirm("¿Reiniciar la jornada? Se perderán los conteos no guardados.")) return;
    setTally({});
    setScannerOn(false);
    setStarted(false);
  };

  const bump = (workerId, delta) => {
    setTally((prev) => {
      const w = workersByQr[workerId];
      if (!w) return prev;
      const cur = prev[w.id] || { name: w.name, count: 0 };
      const next = Math.max(0, cur.count + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[w.id];
        return copy;
      }
      return { ...prev, [w.id]: { name: w.name, count: next } };
    });
  };

  const handleScan = async (rawCode) => {
    const now = Date.now();
    if (lastRef.current.code === rawCode && now - lastRef.current.at < 1500) {
      return; // debounce duplicates
    }
    lastRef.current = { code: rawCode, at: now };

    const extracted = extractCode(rawCode);
    const key = normalizeCode(extracted);

    // Mode: scan workers (each scan = +1 unit for that worker)
    if (scanMode === "worker") {
      let w = workersByQr[key];
      // Fallback: ask backend (same engine used by Check-in attendance/scan)
      if (!w) {
        try {
          const { data } = await api.post("/workers/resolve", { code: rawCode });
          w = data;
          // Add to local list so subsequent scans are instant
          setWorkers((prev) => prev.some((x) => x.id === data.id) ? prev : [...prev, data]);
        } catch (_) {
          const shown = (extracted || rawCode || "").toString().slice(0, 24);
          toast.error(
            `QR "${shown}" no está registrado. Imprime el QR actual del trabajador desde Módulos → Trabajadores.`,
            {
              duration: 6000,
              action: { label: "Ver trabajadores", onClick: () => navigate("/modulos") },
            }
          );
          return;
        }
      }
      setTally((prev) => {
        // Share mode: buffer the worker; actual tally update happens on Confirmar
        if (shareMode) {
          setShareBuffer((buf) => {
            if (buf.some((b) => b.id === w.id)) {
              toast.info(`${w.name} ya está en la pieza compartida`, { duration: 1200 });
              return buf;
            }
            toast.success(`+ ${w.name} comparte esta pieza (${buf.length + 1})`, { duration: 1200 });
            return [...buf, { id: w.id, name: w.name }];
          });
          return prev; // don't change tally yet
        }
        const cur = prev[w.id] || { name: w.name, count: 0, pieces: [] };
        const next = { ...prev, [w.id]: { name: w.name, count: cur.count + 1, pieces: cur.pieces } };
        toast.success(`+1 ${w.name} (${(cur.count + 1).toFixed(2)} u.)`, { duration: 1200 });
        return next;
      });
      return;
    }

    // Mode: scan pieces (worker must be selected first; each scan is a piece ID)
    if (!activeWorkerId) {
      // If no active worker yet, try to interpret this scan as a worker to activate
      let w = workersByQr[key];
      if (!w) {
        try {
          const { data } = await api.post("/workers/resolve", { code: rawCode });
          w = data;
          setWorkers((prev) => prev.some((x) => x.id === data.id) ? prev : [...prev, data]);
        } catch (_) {}
      }
      if (w) {
        setActiveWorkerId(w.id);
        toast.success(`Trabajador activo: ${w.name}`, { duration: 1500 });
        return;
      }
      toast.error("Primero selecciona un trabajador activo");
      return;
    }
    // Avoid double-count of same piece in same session
    const active = workers.find((x) => x.id === activeWorkerId);
    setTally((prev) => {
      const cur = prev[activeWorkerId] || { name: active?.name || "—", count: 0, pieces: [] };
      if (cur.pieces.includes(rawCode)) {
        toast.info("Pieza ya escaneada", { duration: 1000 });
        return prev;
      }
      const next = {
        ...prev,
        [activeWorkerId]: {
          name: active?.name || "—",
          count: cur.count + 1,
          pieces: [...cur.pieces, rawCode],
        },
      };
      toast.success(`Pieza #${cur.count + 1}: ${active?.name}`, { duration: 1000 });
      return next;
    });
  };

  const addManual = (workerId) => {
    const w = workers.find((x) => x.id === workerId);
    if (!w) return;
    if (shareMode) {
      setShareBuffer((buf) => {
        if (buf.some((b) => b.id === w.id)) {
          toast.info(`${w.name} ya está en la pieza compartida`, { duration: 1200 });
          return buf;
        }
        toast.success(`+ ${w.name} comparte esta pieza (${buf.length + 1})`, { duration: 1200 });
        return [...buf, { id: w.id, name: w.name }];
      });
      return;
    }
    setTally((prev) => {
      const cur = prev[w.id] || { name: w.name, count: 0, pieces: [] };
      return { ...prev, [w.id]: { name: w.name, count: cur.count + 1, pieces: cur.pieces } };
    });
  };

  const confirmSharedPiece = () => {
    if (shareBuffer.length === 0) {
      toast.error("Escanea al menos un trabajador para la pieza compartida");
      return;
    }
    const share = 1 / shareBuffer.length;
    setTally((prev) => {
      const next = { ...prev };
      for (const b of shareBuffer) {
        const cur = next[b.id] || { name: b.name, count: 0, pieces: [] };
        next[b.id] = { name: b.name, count: cur.count + share, pieces: cur.pieces };
      }
      return next;
    });
    toast.success(
      shareBuffer.length === 1
        ? `✓ 1 pieza para ${shareBuffer[0].name}`
        : `✓ Pieza dividida entre ${shareBuffer.length} trabajadores (${share.toFixed(2)} c/u)`,
      { duration: 1800 }
    );
    setShareBuffer([]);
  };

  const removeFromShareBuffer = (id) => {
    setShareBuffer((buf) => buf.filter((b) => b.id !== id));
  };

  const clearShareBuffer = () => setShareBuffer([]);

  const totals = useMemo(() => {
    const entries = Object.entries(tally);
    const units = entries.reduce((a, [, v]) => a + v.count, 0);
    const payment = units * (parseFloat(pricePerUnit) || 0);
    return { units, payment, workers: entries.length };
  }, [tally, pricePerUnit]);

  const save = async () => {
    if (payMode === "hour") {
      const price = parseFloat(pricePerHour) || 0;
      if (price <= 0) {
        toast.error("Pon el precio por hora antes de guardar — no puede ser 0");
        return;
      }
      const rows = hourTotals.rows.filter((r) => r.hours > 0);
      if (rows.length === 0) {
        toast.error("No hay trabajadores con horas registradas");
        return;
      }
      setSaving(true);
      try {
        await Promise.all(
          rows.map((r) =>
            api.post("/harvests", {
              worker_id: r.worker_id,
              parcel_id: parcelId,
              product_id: productId,
              kilos: 0,
              units: r.hours,
              price_per_kg: 0,
              price_per_unit: price,
              price_mode: "hour",
              date,
              photo_path: "",
              notes: `Pago por horas: ${r.hours.toFixed(2)} h × ${price} = ${r.payment.toFixed(2)}`,
            })
          )
        );
        toast.success(`Jornada guardada: ${rows.length} trabajador(es) por horas`);
        setScannerOn(false);
        navigate("/dia");
      } catch (e) {
        toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Error al guardar");
      } finally {
        setSaving(false);
      }
      return;
    }

    // Piece mode (default)
    const entries = Object.entries(tally);
    if (entries.length === 0) {
      toast.error("No hay escaneos para guardar");
      return;
    }
    const price = parseFloat(pricePerUnit) || 0;
    if (price <= 0) {
      toast.error("Pon el precio por pieza antes de guardar — no puede ser 0");
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        entries.map(([workerId, v]) =>
          api.post("/harvests", {
            worker_id: workerId,
            parcel_id: parcelId,
            product_id: productId,
            kilos: 0,
            units: v.count,
            price_per_kg: 0,
            price_per_unit: price,
            price_mode: "piece",
            date,
            photo_path: "",
            notes: v.pieces?.length
              ? `Piezas escaneadas: ${v.pieces.join(", ")}`
              : "Cosecha escaneada por QR",
          })
        )
      );
      toast.success(`Jornada guardada: ${entries.length} trabajador(es)`);
      setTally({});
      setActiveWorkerId("");
      setScannerOn(false);
      setStarted(false);
      navigate("/dia");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const selectedParcel = parcels.find((p) => p.id === parcelId);

  return (
    <div className="space-y-5" data-testid="scan-harvest-mode">
      {/* Session banner when autoloaded from check-in */}
      {autoFromCheckin && started && (
        <div className="rounded-2xl bg-[#1E2746] text-white p-4 flex items-center justify-between" data-testid="scan-session-banner">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/60">Jornada activa</div>
            <div className="font-bold truncate">
              {selectedParcel?.name || "—"} • {selectedProduct?.name || "—"}
            </div>
          </div>
          <button
            onClick={() => navigate("/asistencia")}
            className="text-sm font-bold bg-white/10 hover:bg-white/20 rounded-full px-3 h-9"
            data-testid="scan-back-hub"
          >
            Hub
          </button>
        </div>
      )}

      {/* Setup — hidden when auto-started from check-in */}
      {!autoFromCheckin && (
      <div className="field-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-[#1E4620]" />
          <h3 className="text-lg font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
            Configurar jornada
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Parcela</label>
            <select value={parcelId} onChange={(e) => setParcelId(e.target.value)} disabled={started} className="field-input !h-12 !text-base disabled:bg-[#F7F5EE]" data-testid="scan-parcel-select">
              <option value="">— Seleccionar —</option>
              {parcels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Producto</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} disabled={started} className="field-input !h-12 !text-base disabled:bg-[#F7F5EE]" data-testid="scan-product-select">
              <option value="">— Seleccionar —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Fecha</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input !h-12 !text-base" data-testid="scan-date-input" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Precio por {unitLabel} ($)</label>
            <input type="number" step="0.01" min="0" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} className="field-input !h-12 !text-base" data-testid="scan-price-input" />
          </div>
        </div>

        {!started ? (
          <button onClick={startSession} className="field-btn-primary" data-testid="scan-start-button">
            <Play className="w-5 h-5" /> Iniciar jornada
          </button>
        ) : (
          <>
            {/* Scan mode toggle */}
            <div>
              <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">Qué estás escaneando</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setScanMode("worker"); setActiveWorkerId(""); }}
                  data-testid="scan-mode-worker"
                  className={`h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 border-2 ${
                    scanMode === "worker"
                      ? "bg-[#1E4620] text-white border-[#1E4620]"
                      : "bg-white text-[#556047] border-[#E2DDD0] hover:bg-[#F7F5EE]"
                  }`}
                >
                  <Users className="w-4 h-4" /> Por trabajador
                </button>
                <button
                  type="button"
                  onClick={() => setScanMode("piece")}
                  data-testid="scan-mode-piece"
                  className={`h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 border-2 ${
                    scanMode === "piece"
                      ? "bg-[#1E4620] text-white border-[#1E4620]"
                      : "bg-white text-[#556047] border-[#E2DDD0] hover:bg-[#F7F5EE]"
                  }`}
                >
                  <Package className="w-4 h-4" /> Por pieza
                </button>
              </div>
              <p className="text-[11px] text-[#556047] mt-1.5 font-semibold">
                {scanMode === "worker"
                  ? "Cada escaneo del QR del trabajador suma 1 pieza para él."
                  : "Selecciona un trabajador activo. Cada escaneo registra una pieza única para él."}
              </p>
            </div>

            {/* Active worker selector (piece mode) */}
            {scanMode === "piece" && (
              <div>
                <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">Trabajador activo</label>
                <select
                  value={activeWorkerId}
                  onChange={(e) => setActiveWorkerId(e.target.value)}
                  className="field-input !h-12 !text-base"
                  data-testid="active-worker-select"
                >
                  <option value="">— Seleccionar trabajador —</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setScannerOn((v) => !v)}
                className={`flex-1 h-12 rounded-xl font-bold text-base flex items-center justify-center gap-1.5 border-2 ${
                  scannerOn
                    ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                    : "bg-[#1E4620] text-white border-[#1E4620] hover:bg-[#153417]"
                }`}
                data-testid="scan-toggle-camera"
              >
                {scannerOn ? <><CameraOff className="w-5 h-5" /> Pausar cámara</> : <><Camera className="w-5 h-5" /> Reanudar cámara</>}
              </button>
              <button
                onClick={resetSession}
                className="h-12 px-4 bg-white border-2 border-[#E2DDD0] hover:bg-[#F7F5EE] text-[#556047] font-bold rounded-xl flex items-center gap-1.5"
                data-testid="scan-reset-button"
              >
                <RotateCcw className="w-4 h-4" /> Reiniciar
              </button>
            </div>
          </>
        )}
      </div>
      )}

      {/* Pay-mode toggle + price (visible when started) */}
      {started && (
        <div className="field-card p-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">¿Cómo se paga?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayMode("piece")}
                data-testid="paymode-piece"
                className={`h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 ${
                  payMode === "piece"
                    ? "bg-[#1E4620] text-white border-[#1E4620]"
                    : "bg-white text-[#556047] border-[#E2DDD0]"
                }`}
              >
                <Package className="w-4 h-4" /> Por pieza
              </button>
              <button
                type="button"
                onClick={() => setPayMode("hour")}
                data-testid="paymode-hour"
                className={`h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 ${
                  payMode === "hour"
                    ? "bg-[#1E4620] text-white border-[#1E4620]"
                    : "bg-white text-[#556047] border-[#E2DDD0]"
                }`}
              >
                <Clock className="w-4 h-4" /> Por hora
              </button>
            </div>
          </div>

          {payMode === "piece" ? (
            <div>
              <label className="flex items-center justify-between text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">
                <span>Precio por pieza ($)</span>
                {pieceLocked && (
                  <span className="flex items-center gap-1 text-emerald-700 normal-case tracking-normal" data-testid="price-locked-piece">
                    <Lock className="w-3 h-3" /> Guardado para este producto
                  </span>
                )}
              </label>
              <div className="relative">
                <DollarSign className="w-5 h-5 text-[#889078] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                  placeholder="0.00"
                  className="field-input !h-12 !text-base w-full !pl-10"
                  data-testid="paymode-piece-price"
                />
              </div>
              {!pieceLocked && (
                <p className="text-[11px] text-[#889078] font-semibold mt-1">
                  Pon el precio UNA vez. Se guardará para todos los trabajadores de este rancho.
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="flex items-center justify-between text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">
                <span>Precio por hora ($)</span>
                {hourLocked && (
                  <span className="flex items-center gap-1 text-emerald-700 normal-case tracking-normal" data-testid="price-locked-hour">
                    <Lock className="w-3 h-3" /> Guardado para este producto
                  </span>
                )}
              </label>
              <div className="relative">
                <DollarSign className="w-5 h-5 text-[#889078] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={pricePerHour}
                  onChange={(e) => setPricePerHour(e.target.value)}
                  placeholder="0.00"
                  className="field-input !h-12 !text-base w-full !pl-10"
                  data-testid="paymode-hour-price"
                />
              </div>
              {!hourLocked && (
                <p className="text-[11px] text-[#889078] font-semibold mt-1">
                  Pon el precio UNA vez. Se guardará para todos los trabajadores de este rancho.
                </p>
              )}
            </div>
          )}

          {/* Share-piece toggle — only visible in piece mode */}
          {payMode === "piece" && (
            <div className="pt-3 border-t border-[#E2DDD0]">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-[#1A2210]">
                    <Users className="w-4 h-4 text-[#E89C3F]" /> Compartir pieza
                  </div>
                  <p className="text-[11px] text-[#889078] font-semibold mt-0.5">
                    Escanea varios trabajadores y toca <b>Confirmar pieza</b>: el precio se divide entre ellos.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={shareMode}
                  onChange={(e) => {
                    setShareMode(e.target.checked);
                    if (!e.target.checked) setShareBuffer([]);
                  }}
                  className="w-6 h-6 accent-[#E89C3F] flex-shrink-0"
                  data-testid="share-mode-toggle"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* Share buffer card — only in piece + shareMode with buffer */}
      {started && payMode === "piece" && shareMode && (
        <div className="field-card p-4 border-l-4 border-l-[#E89C3F] bg-[#FDF6EC]/50" data-testid="share-buffer-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-[#1A2210] flex items-center gap-1.5" style={{ fontFamily: "Outfit, sans-serif" }}>
              <Users className="w-4 h-4 text-[#E89C3F]" /> Pieza compartida
              {shareBuffer.length > 0 && (
                <span className="font-mono-stat text-sm text-[#E89C3F]">({shareBuffer.length})</span>
              )}
            </h3>
            {shareBuffer.length > 0 && (
              <button
                onClick={clearShareBuffer}
                className="text-xs font-bold text-[#889078] hover:text-red-600"
                data-testid="share-clear-button"
              >
                Vaciar
              </button>
            )}
          </div>
          {shareBuffer.length === 0 ? (
            <p className="text-xs text-[#556047] font-semibold text-center py-3">
              Escanea los trabajadores que comparten esta pieza
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {shareBuffer.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => removeFromShareBuffer(b.id)}
                    className="h-8 pl-3 pr-2 rounded-full bg-white border-2 border-[#E89C3F] text-[#1A2210] text-xs font-bold flex items-center gap-1.5"
                    data-testid={`share-chip-${b.id}`}
                  >
                    {b.name}
                    <X className="w-3 h-3 text-[#889078]" />
                  </button>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-[#E2DDD0] p-3 mb-3 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#889078]">Cada uno recibirá</div>
                <div className="font-mono-stat text-lg text-[#1A2210]">
                  {(1 / shareBuffer.length).toFixed(3)} pieza
                  {" "}·{" "}
                  <span className="text-[#15803D]">
                    {formatCurrency((parseFloat(pricePerUnit) || 0) / shareBuffer.length)}
                  </span>
                </div>
              </div>
              <button
                onClick={confirmSharedPiece}
                className="w-full h-12 rounded-xl bg-[#E89C3F] hover:bg-[#D08929] text-white font-extrabold flex items-center justify-center gap-2 shadow-md"
                data-testid="share-confirm-button"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                <CheckCircle2 className="w-5 h-5" /> Confirmar pieza compartida
              </button>
            </>
          )}
        </div>
      )}

      {/* Compact toolbar when auto-started from check-in (piece mode only) */}
      {autoFromCheckin && started && payMode === "piece" && (
        <div className="flex gap-2">
          <button
            onClick={() => setScannerOn((v) => !v)}
            className={`flex-1 h-12 rounded-xl font-bold text-base flex items-center justify-center gap-1.5 border-2 ${
              scannerOn
                ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                : "bg-[#1E4620] text-white border-[#1E4620] hover:bg-[#153417]"
            }`}
            data-testid="scan-toggle-camera-compact"
          >
            {scannerOn ? <><CameraOff className="w-5 h-5" /> Pausar cámara</> : <><Camera className="w-5 h-5" /> Reanudar cámara</>}
          </button>
          <button
            onClick={() => {
              if (Object.keys(tally).length > 0 && !window.confirm("¿Reiniciar conteos?")) return;
              setTally({});
            }}
            className="h-12 px-4 bg-white border-2 border-[#E2DDD0] hover:bg-[#F7F5EE] text-[#556047] font-bold rounded-xl flex items-center gap-1.5"
            data-testid="scan-reset-compact"
          >
            <RotateCcw className="w-4 h-4" /> Reiniciar
          </button>
        </div>
      )}

      {/* Scanner — only in piece mode */}
      {started && payMode === "piece" && (
        <div className="field-card p-4 sm:p-5">
          {scannerOn ? (
            <QrScanner active={scannerOn} onScan={handleScan} />
          ) : (
            <div className="rounded-2xl bg-[#F0EDE1] border-2 border-dashed border-[#D4CEB8] py-10 text-center">
              <Camera className="w-10 h-10 mx-auto text-[#889078] mb-2" />
              <p className="text-sm font-semibold text-[#556047]">Cámara pausada</p>
            </div>
          )}

          {/* Manual add fallback */}
          <div className="mt-4 pt-4 border-t border-[#E2DDD0]">
            <div className="text-xs font-bold text-[#1A2210] uppercase tracking-wider mb-2">
              Agregar +1 manualmente
            </div>
            <div className="flex gap-2">
              <select
                defaultValue=""
                onChange={(e) => { if (e.target.value) { addManual(e.target.value); e.target.value = ""; } }}
                className="field-input !h-12 !text-base flex-1"
                data-testid="scan-manual-add"
              >
                <option value="">— Trabajador —</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Totals */}
      {started && payMode === "piece" && (
        <div className="sticky top-[64px] z-30 -mx-4 px-4 py-2 bg-[#F7F5EE]/95 backdrop-blur-sm sm:static sm:bg-transparent sm:px-0 sm:py-0 sm:mx-0">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-[#1E4620] text-white p-4 border-2 border-[#153417] shadow-sm" data-testid="scan-total-workers">
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-90 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> Trabajadores</div>
              <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{totals.workers}</div>
            </div>
            <div className="rounded-2xl bg-white border-2 border-[#E2DDD0] text-[#1A2210] p-4 shadow-sm" data-testid="scan-total-units">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#556047]">Total piezas</div>
              <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{formatNumber(totals.units, 0)}</div>
            </div>
            <div className="rounded-2xl bg-[#E65100] text-white p-4 border-2 border-[#C63D00] shadow-sm" data-testid="scan-total-payment">
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">Pago total</div>
              <div className="font-mono-stat text-xl sm:text-2xl mt-1">{formatCurrency(totals.payment)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Hour-mode totals + per-worker list */}
      {started && payMode === "hour" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-[#1E4620] text-white p-4 border-2 border-[#153417] shadow-sm" data-testid="hour-total-workers">
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-90 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> Trabajadores</div>
              <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{hourTotals.workers}</div>
            </div>
            <div className="rounded-2xl bg-white border-2 border-[#E2DDD0] text-[#1A2210] p-4 shadow-sm" data-testid="hour-total-hours">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#556047]">Total horas</div>
              <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{formatNumber(hourTotals.totalHours, 2)}</div>
            </div>
            <div className="rounded-2xl bg-[#E65100] text-white p-4 border-2 border-[#C63D00] shadow-sm" data-testid="hour-total-payment">
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">Pago total</div>
              <div className="font-mono-stat text-xl sm:text-2xl mt-1">{formatCurrency(hourTotals.totalPay)}</div>
            </div>
          </div>

          <div className="field-card p-4 sm:p-5">
            <h3 className="text-lg font-bold text-[#1A2210] mb-3" style={{ fontFamily: "Outfit, sans-serif" }}>
              Pago por horas trabajadas
            </h3>
            {hourTotals.rows.length === 0 ? (
              <p className="text-sm text-[#556047] font-semibold py-4 text-center" data-testid="hour-empty">
                Sin trabajadores con asistencia hoy. Da entrada en Check in primero.
              </p>
            ) : (
              <>
                <div className="divide-y divide-[#E2DDD0]">
                  {hourTotals.rows.map((r) => (
                    <div key={r.id} className="py-3 flex items-center justify-between gap-3" data-testid={`hour-row-${r.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[#1A2210] truncate">{r.name}</div>
                        <div className="text-xs text-[#556047] font-semibold">
                          {r.check_in || "—"}{r.check_out ? ` → ${r.check_out}` : " (en campo)"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono-stat text-lg text-[#1A2210]">{formatNumber(r.hours, 2)} h</div>
                        <div className="text-xs text-[#15803D] font-bold">{formatCurrency(r.payment)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t-2 border-dashed border-[#1E4620]/30">
                  <div className="rounded-2xl bg-[#1E4620] text-white p-4 flex items-center justify-between" data-testid="hour-grand-total">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-widest opacity-90">Total jornada</div>
                      <div className="text-sm font-bold opacity-95 mt-0.5">
                        {hourTotals.workers} trabajador{hourTotals.workers !== 1 ? "es" : ""} • {formatNumber(hourTotals.totalHours, 2)} h
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono-stat text-3xl leading-none">{formatCurrency(hourTotals.totalPay)}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80 mt-1">A pagar</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={save}
                  disabled={saving || hourTotals.totalHours === 0}
                  className="field-btn-accent mt-4 disabled:opacity-60"
                  data-testid="hour-save-button"
                >
                  {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Save className="w-6 h-6" /> Guardar pago por horas ({formatCurrency(hourTotals.totalPay)})</>}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Tally list — piece mode */}
      {started && payMode === "piece" && (
        <div className="field-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
              Conteo por trabajador
            </h3>
            {Object.keys(tally).length > 0 && (
              <div className="text-xs font-bold text-[#556047] uppercase tracking-wider">
                {Object.keys(tally).length} trabajador(es)
              </div>
            )}
          </div>
          {Object.keys(tally).length === 0 ? (
            <p className="text-sm text-[#556047] font-semibold py-4 text-center" data-testid="scan-tally-empty">
              Aún no hay escaneos. Enfoca un QR para empezar.
            </p>
          ) : (
            <>
              <div className="divide-y divide-[#E2DDD0]">
                {Object.entries(tally)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([wid, v]) => {
                    const payment = v.count * (parseFloat(pricePerUnit) || 0);
                    return (
                      <div key={wid} className="py-3 flex items-center justify-between gap-3" data-testid={`scan-tally-row-${wid}`}>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-[#1A2210] truncate">{v.name}</div>
                          <div className="text-xs text-[#556047] font-semibold">
                            {formatNumber(v.count, v.count % 1 === 0 ? 0 : 2)} pieza{v.count !== 1 ? "s" : ""} • <span className="text-[#15803D] font-bold">{formatCurrency(payment)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => bump(wid, -1)}
                            className="w-10 h-10 rounded-xl bg-white border-2 border-[#E2DDD0] hover:bg-red-50 hover:border-red-200 text-red-600 flex items-center justify-center font-bold"
                            data-testid={`scan-dec-${wid}`}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <div className="font-mono-stat text-xl text-[#1A2210] w-12 text-center" data-testid={`scan-count-${wid}`}>
                            {v.count % 1 === 0 ? v.count : v.count.toFixed(2)}
                          </div>
                          <button
                            onClick={() => bump(wid, 1)}
                            className="w-10 h-10 rounded-xl bg-[#1E4620] hover:bg-[#153417] text-white flex items-center justify-center"
                            data-testid={`scan-inc-${wid}`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Grand total footer */}
              <div className="mt-3 pt-3 border-t-2 border-dashed border-[#1E4620]/30">
                <div className="rounded-2xl bg-[#1E4620] text-white p-4 flex items-center justify-between" data-testid="scan-grand-total">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-widest opacity-90">Total jornada</div>
                    <div className="text-sm font-bold opacity-95 mt-0.5">
                      {totals.workers} trabajador{totals.workers !== 1 ? "es" : ""} • {formatNumber(totals.units, 0)} pieza{totals.units !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-stat text-3xl leading-none">{formatCurrency(totals.payment)}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-80 mt-1">A pagar</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {Object.keys(tally).length > 0 && (
            <button
              onClick={save}
              disabled={saving}
              className="field-btn-accent mt-4 disabled:opacity-60"
              data-testid="scan-save-button"
            >
              {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Save className="w-6 h-6" /> Guardar jornada ({formatCurrency(totals.payment)})</>}
            </button>
          )}
        </div>
      )}

      {/* Sticky quick-save bar — floats above bottom nav after first scan */}
      {started && payMode === "piece" && Object.keys(tally).length > 0 && (
        <>
          <div className="h-24" aria-hidden />
          <div className="fixed left-0 right-0 bottom-[72px] z-40 px-3 pointer-events-none" data-testid="quick-save-bar">
            <div className="max-w-5xl mx-auto pointer-events-auto">
              <button
                onClick={save}
                disabled={saving}
                className="w-full h-14 rounded-2xl bg-[#E65100] hover:bg-[#C63D00] active:scale-[0.99] text-white font-extrabold text-base shadow-2xl flex items-center justify-between px-5 disabled:opacity-70 border-2 border-[#C63D00]"
                data-testid="quick-save-button"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                <span className="flex items-center gap-2">
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Guardar ahora
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
                    {totals.workers}👤 · {formatNumber(totals.units, 0)}🧺
                  </span>
                  <span className="font-mono-stat text-lg">{formatCurrency(totals.payment)}</span>
                </span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
