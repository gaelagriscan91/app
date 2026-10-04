import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera, CameraOff, Minus, Plus, Save, Loader2,
  RotateCcw, UserCheck, DollarSign, History,
} from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, formatNumber, formatApiErrorDetail, todayISO } from "@/lib/api";
import QrScanner from "@/components/QrScanner";

// Short "ding" via Web Audio API — plays on every successful scan
let _audioCtx = null;
function playBeep() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.17);
  } catch (_) {}
}

/**
 * Minimalist Picking mode:
 * Only: price input + camera (scan) + manual add + save.
 * Parcela/producto/fecha are resolved automatically from session (Check-in)
 * or from the first available defaults (auto-created if none).
 */
export default function ScanHarvestMode() {
  const navigate = useNavigate();
  const todayKey = todayISO();

  const [workers, setWorkers] = useState([]);
  const [parcelId, setParcelId] = useState("");
  const [productId, setProductId] = useState("");
  const [parcelName, setParcelName] = useState("");
  const [productName, setProductName] = useState("");
  const [unitLabel, setUnitLabel] = useState("unidad");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [ready, setReady] = useState(false);

  const [scannerOn, setScannerOn] = useState(false);
  const [tally, setTally] = useState({}); // { worker_id: {name, count} }
  const [saving, setSaving] = useState(false);

  const lastRef = useRef({ code: "", at: 0 });
  const scannedCodesRef = useRef(new Map());
  const SCAN_COOLDOWN_MS = 2 * 60 * 1000;

  // Scan history (bottom log)
  const [scanHistory, setScanHistory] = useState([]);
  const pushHistory = (name) => {
    setScanHistory((prev) =>
      [{ id: `${Date.now()}-${Math.random()}`, name, at: new Date() }, ...prev].slice(0, 50)
    );
  };

  // Resolve session: localStorage (from Check-in) → first parcel/product → auto-create defaults
  useEffect(() => {
    (async () => {
      try {
        let session = {};
        try { session = JSON.parse(localStorage.getItem(`agriscan.session.${todayKey}`) || "{}"); }
        catch { session = {}; }

        const [wRes, pRes, prRes] = await Promise.all([
          api.get("/workers"),
          api.get("/parcels"),
          api.get("/products"),
        ]);
        setWorkers((wRes.data || []).filter((x) => x.active !== false));
        let parcels = (pRes.data || []).filter((x) => x.active !== false);
        let products = (prRes.data || []).filter((x) => x.active !== false);

        // Auto-create defaults if none exist
        if (parcels.length === 0) {
          const { data } = await api.post("/parcels", { name: "Rancho General", active: true });
          parcels = [data];
        }
        if (products.length === 0) {
          const { data } = await api.post("/products", { name: "Cosecha", unit_label: "pieza", pricing_mode: "unit", active: true });
          products = [data];
        }

        const parcel = parcels.find((p) => p.id === session.parcelId) || parcels[0];
        const product = products.find((p) => p.id === session.productId) || products[0];

        setParcelId(parcel.id);
        setParcelName(parcel.name || "");
        setProductId(product.id);
        setProductName(product.name || "");
        setUnitLabel(product.unit_label || "unidad");

        // Preload price (admin can override)
        const pu = Number(product.price_per_unit) || 0;
        if (pu > 0) setPricePerUnit(String(pu));

        setReady(true);
        setScannerOn(true);
      } catch (_) {
        toast.error("No se pudo preparar la jornada");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizeCode = (s) => (s || "").toString().trim().toUpperCase();
  const extractCode = (raw) => {
    const s = (raw || "").toString().trim();
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

  const bump = (workerId, delta) => {
    setTally((prev) => {
      const existing = prev[workerId];
      const name = existing?.name || workers.find((x) => x.id === workerId)?.name || "—";
      const cur = existing || { name, count: 0 };
      const next = Math.max(0, cur.count + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[workerId];
        return copy;
      }
      return { ...prev, [workerId]: { name, count: next } };
    });
  };

  const setCountDirect = (workerId, raw) => {
    const parsed = parseFloat(raw);
    const value = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setTally((prev) => {
      const existing = prev[workerId];
      const name = existing?.name || workers.find((x) => x.id === workerId)?.name || "—";
      if (value === 0) {
        const copy = { ...prev };
        delete copy[workerId];
        return copy;
      }
      return { ...prev, [workerId]: { name, count: value } };
    });
  };

  const handleScan = async (rawCode) => {
    const now = Date.now();
    if (lastRef.current.code === rawCode && now - lastRef.current.at < 1500) return;
    lastRef.current = { code: rawCode, at: now };

    const extracted = extractCode(rawCode);
    const key = normalizeCode(extracted);

    // Anti-fraud cooldown
    const lastAt = scannedCodesRef.current.get(key) || 0;
    const elapsed = now - lastAt;
    if (lastAt > 0 && elapsed < SCAN_COOLDOWN_MS) {
      const remaining = Math.ceil((SCAN_COOLDOWN_MS - elapsed) / 1000);
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      const label = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      toast.error(`⏱️ Código ya escaneado. Espera ${label}.`, { duration: 2500 });
      return;
    }

    let w = workersByQr[key];
    if (!w) {
      try {
        const { data } = await api.post("/workers/resolve", { code: rawCode });
        w = data;
        setWorkers((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]));
      } catch (_) {
        toast.error(`QR no registrado. Añade al trabajador en Módulos.`, { duration: 4000 });
        return;
      }
    }

    setTally((prev) => {
      const cur = prev[w.id] || { name: w.name, count: 0 };
      const next = { ...prev, [w.id]: { name: w.name, count: cur.count + 1 } };
      toast.success(`+1 ${w.name}`, { duration: 1200 });
      scannedCodesRef.current.set(key, now);
      playBeep();
      pushHistory(w.name);
      setScannerOn(false);
      return next;
    });
  };

  const addManual = (workerId) => {
    const w = workers.find((x) => x.id === workerId);
    if (!w) return;
    setTally((prev) => {
      const cur = prev[w.id] || { name: w.name, count: 0 };
      return { ...prev, [w.id]: { name: w.name, count: cur.count + 1 } };
    });
    playBeep();
    pushHistory(w.name);
  };

  const totals = useMemo(() => {
    const entries = Object.entries(tally);
    const units = entries.reduce((a, [, v]) => a + v.count, 0);
    const payment = units * (parseFloat(pricePerUnit) || 0);
    return { units, payment, workers: entries.length };
  }, [tally, pricePerUnit]);

  const resetTally = () => {
    if (Object.keys(tally).length > 0 && !window.confirm("¿Reiniciar conteos?")) return;
    setTally({});
  };

  const save = async () => {
    const entries = Object.entries(tally);
    if (entries.length === 0) {
      toast.error("No hay escaneos para guardar");
      return;
    }
    const price = parseFloat(pricePerUnit) || 0;
    if (price <= 0) {
      toast.error("Pon el precio antes de guardar");
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
            date: todayKey,
            photo_path: "",
            notes: "Cosecha escaneada",
          })
        )
      );
      toast.success(`Jornada guardada: ${entries.length} trabajador(es)`);
      setTally({});
      setScannerOn(false);
      navigate("/dia");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return (
      <div className="field-card p-6 flex items-center justify-center gap-2 text-[#556047] font-bold" data-testid="scan-loading">
        <Loader2 className="w-5 h-5 animate-spin" /> Preparando jornada…
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="scan-harvest-mode">
      {/* Price card */}
      <div className="field-card p-4 sm:p-5 space-y-3" data-testid="price-card">
        <label className="block text-xs font-bold text-[#1A2210] uppercase tracking-wider">
          Precio por {unitLabel} ($)
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
            className="field-input !h-14 !text-xl font-mono-stat w-full !pl-10"
            data-testid="paymode-piece-price"
          />
        </div>
      </div>

      {/* Scanner + Manual add */}
      <div className="field-card p-4 sm:p-5 space-y-3">
        {scannerOn ? (
          <QrScanner onDecode={handleScan} onError={() => {}} />
        ) : (
          <button
            onClick={() => setScannerOn(true)}
            className="w-full h-14 rounded-2xl bg-[#1E4620] hover:bg-[#153417] text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-md"
            data-testid="open-scanner-fullscreen"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            <Camera className="w-5 h-5" /> Escanear
          </button>
        )}

        {scannerOn && (
          <button
            onClick={() => setScannerOn(false)}
            className="w-full h-11 rounded-xl bg-red-50 text-red-700 border-2 border-red-200 hover:bg-red-100 font-bold flex items-center justify-center gap-2"
            data-testid="scan-toggle-camera"
          >
            <CameraOff className="w-5 h-5" /> Pausar cámara
          </button>
        )}

        {/* Manual add */}
        <div className="pt-3 border-t border-[#E2DDD0]">
          <label className="block text-xs font-bold text-[#1A2210] uppercase tracking-wider mb-2">
            Manual
          </label>
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) { addManual(e.target.value); e.target.value = ""; } }}
            className="field-input !h-12 !text-base w-full"
            data-testid="scan-manual-add"
          >
            <option value="">— Trabajador —</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-[#1E4620] text-white p-4 border-2 border-[#153417] shadow-sm" data-testid="scan-total-workers">
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-90 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" /> Trabajadores</div>
          <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{totals.workers}</div>
        </div>
        <div className="rounded-2xl bg-white border-2 border-[#E2DDD0] text-[#1A2210] p-4 shadow-sm" data-testid="scan-total-units">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#556047]">Piezas</div>
          <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{formatNumber(totals.units, totals.units % 1 === 0 ? 0 : 2)}</div>
        </div>
        <div className="rounded-2xl bg-[#E65100] text-white p-4 border-2 border-[#C63D00] shadow-sm" data-testid="scan-total-payment">
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">Pago</div>
          <div className="font-mono-stat text-xl sm:text-2xl mt-1">{formatCurrency(totals.payment)}</div>
        </div>
      </div>

      {/* Tally list */}
      {Object.keys(tally).length > 0 && (
        <div className="field-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
              Conteo
            </h3>
            <button
              onClick={resetTally}
              className="h-9 px-3 bg-white border-2 border-[#E2DDD0] hover:bg-[#F7F5EE] text-[#556047] font-bold rounded-xl text-xs flex items-center gap-1.5"
              data-testid="scan-reset-button"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reiniciar
            </button>
          </div>
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
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={v.count % 1 === 0 ? String(v.count) : v.count.toFixed(2)}
                        onChange={(e) => setCountDirect(wid, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        className="font-mono-stat text-xl text-[#1A2210] w-16 text-center bg-[#F7F5EE] border-2 border-[#E2DDD0] focus:border-[#1E4620] rounded-xl h-10 outline-none px-1"
                        data-testid={`scan-count-${wid}`}
                        aria-label="Cantidad editable"
                      />
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
        </div>
      )}

      {/* Scan history */}
      {scanHistory.length > 0 && (
        <div className="field-card p-4 sm:p-5" data-testid="scan-history-card">
          <h3 className="text-sm font-bold text-[#1A2210] mb-2 flex items-center gap-1.5" style={{ fontFamily: "Outfit, sans-serif" }}>
            <History className="w-4 h-4" /> Historial
          </h3>
          <ul className="text-xs text-[#556047] font-semibold space-y-1 max-h-32 overflow-y-auto">
            {scanHistory.map((h) => (
              <li key={h.id} className="flex items-center justify-between">
                <span className="truncate">{h.name}</span>
                <span className="opacity-70 text-[10px]">{h.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sticky save bar */}
      {Object.keys(tally).length > 0 && (
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
                  Guardar
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
                    {totals.workers}👤 · {formatNumber(totals.units, totals.units % 1 === 0 ? 0 : 2)}🧺
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
