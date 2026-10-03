import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Camera, CameraOff, ScanLine, Minus, Plus, Save, Loader2,
  Play, RotateCcw, UserCheck, Package, Users,
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

  const [workers, setWorkers] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [products, setProducts] = useState([]);

  const [parcelId, setParcelId] = useState(urlParams.get("parcel") || "");
  const [productId, setProductId] = useState(urlParams.get("product") || "");
  const [date, setDate] = useState(todayISO());
  const [pricePerUnit, setPricePerUnit] = useState("");

  const [started, setStarted] = useState(false);
  const [scannerOn, setScannerOn] = useState(false);
  const [tally, setTally] = useState({}); // { worker_id: {name, count, pieces:[]} }
  const [saving, setSaving] = useState(false);
  const [scanMode, setScanMode] = useState("worker"); // "worker" | "piece"
  const [activeWorkerId, setActiveWorkerId] = useState("");
  const lastRef = useRef({ code: "", at: 0 });

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
  const workersByQr = useMemo(() => {
    const map = {};
    workers.forEach((w) => {
      if (w.qr_code) map[w.qr_code] = w;
      map[w.id] = w;
    });
    return map;
  }, [workers]);

  useEffect(() => {
    if (selectedProduct) {
      setPricePerUnit(String(selectedProduct.price_per_unit ?? 0));
    }
  }, [selectedProduct]);

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

  const handleScan = (code) => {
    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < 1500) {
      return; // debounce duplicates
    }
    lastRef.current = { code, at: now };

    // Mode: scan workers (each scan = +1 unit for that worker)
    if (scanMode === "worker") {
      const w = workersByQr[code] || workersByQr[(code || "").trim()];
      if (!w) {
        toast.error("QR no reconocido");
        return;
      }
      setTally((prev) => {
        const cur = prev[w.id] || { name: w.name, count: 0, pieces: [] };
        const next = { ...prev, [w.id]: { name: w.name, count: cur.count + 1, pieces: cur.pieces } };
        toast.success(`+1 ${w.name} (${cur.count + 1} u.)`, { duration: 1200 });
        return next;
      });
      return;
    }

    // Mode: scan pieces (worker must be selected first; each scan is a piece ID)
    if (!activeWorkerId) {
      // If no active worker yet, try to interpret this scan as a worker to activate
      const w = workersByQr[code];
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
      if (cur.pieces.includes(code)) {
        toast.info("Pieza ya escaneada", { duration: 1000 });
        return prev;
      }
      const next = {
        ...prev,
        [activeWorkerId]: {
          name: active?.name || "—",
          count: cur.count + 1,
          pieces: [...cur.pieces, code],
        },
      };
      toast.success(`Pieza #${cur.count + 1}: ${active?.name}`, { duration: 1000 });
      return next;
    });
  };

  const addManual = (workerId) => {
    const w = workers.find((x) => x.id === workerId);
    if (!w) return;
    setTally((prev) => {
      const cur = prev[w.id] || { name: w.name, count: 0, pieces: [] };
      return { ...prev, [w.id]: { name: w.name, count: cur.count + 1, pieces: cur.pieces } };
    });
  };

  const totals = useMemo(() => {
    const entries = Object.entries(tally);
    const units = entries.reduce((a, [, v]) => a + v.count, 0);
    const payment = units * (parseFloat(pricePerUnit) || 0);
    return { units, payment, workers: entries.length };
  }, [tally, pricePerUnit]);

  const save = async () => {
    const entries = Object.entries(tally);
    if (entries.length === 0) {
      toast.error("No hay escaneos para guardar");
      return;
    }
    setSaving(true);
    try {
      const price = parseFloat(pricePerUnit) || 0;
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

  return (
    <div className="space-y-5" data-testid="scan-harvest-mode">
      {/* Setup */}
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

      {/* Scanner */}
      {started && (
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
      {started && (
        <div className="sticky top-[64px] z-30 -mx-4 px-4 py-2 bg-[#F7F5EE]/95 backdrop-blur-sm sm:static sm:bg-transparent sm:px-0 sm:py-0 sm:mx-0">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-[#1E4620] text-white p-4 border-2 border-[#153417] shadow-sm" data-testid="scan-total-workers">
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-90 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> Trabajadores</div>
              <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{totals.workers}</div>
            </div>
            <div className="rounded-2xl bg-white border-2 border-[#E2DDD0] text-[#1A2210] p-4 shadow-sm" data-testid="scan-total-units">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#556047]">Total {unitLabel}s</div>
              <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{formatNumber(totals.units, 0)}</div>
            </div>
            <div className="rounded-2xl bg-[#E65100] text-white p-4 border-2 border-[#C63D00] shadow-sm" data-testid="scan-total-payment">
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">Pago total</div>
              <div className="font-mono-stat text-xl sm:text-2xl mt-1">{formatCurrency(totals.payment)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tally list */}
      {started && (
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
                            {formatNumber(v.count, 0)} {unitLabel}{v.count !== 1 ? "s" : ""} • <span className="text-[#15803D] font-bold">{formatCurrency(payment)}</span>
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
                          <div className="font-mono-stat text-xl text-[#1A2210] w-10 text-center" data-testid={`scan-count-${wid}`}>{v.count}</div>
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
                      {totals.workers} trabajador{totals.workers !== 1 ? "es" : ""} • {formatNumber(totals.units, 0)} {unitLabel}{totals.units !== 1 ? "s" : ""}
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
    </div>
  );
}
