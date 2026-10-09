import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import {
  Camera, CameraOff, Minus, Plus, Save, Loader2, RotateCcw,
  DollarSign, X, UserPlus, ListChecks, Users, Check, Trash2,
  Zap, ZapOff, Keyboard, SwitchCamera,
} from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, formatNumber, formatApiErrorDetail, todayISO } from "@/lib/api";

// Short "ding" via Web Audio API
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
 * FieldClock-style immersive picking screen:
 *  - Full-screen camera viewfinder
 *  - Floating price card (top-left)
 *  - Blue bottom bar: last worker + big piece/payment totals
 *  - Side actions: Manual add, Pause camera, Save
 */
export default function ScanHarvestMode() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnPath = searchParams.get("from") === "cosecha" ? "/cosecha" : "/";
  const todayKey = todayISO();

  const [workers, setWorkers] = useState([]);
  const [parcelId, setParcelId] = useState("");
  const [productId, setProductId] = useState("");
  const [parcelName, setParcelName] = useState("");
  const [unitLabel, setUnitLabel] = useState("pieza");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [ready, setReady] = useState(false);

  const [scannerOn, setScannerOn] = useState(true);
  const [tally, setTally] = useState({}); // { worker_id: {name, count} }
  const [lastWorker, setLastWorker] = useState(null); // {id, name}
  const [lbPrompt, setLbPrompt] = useState(null); // {id, name, source} when unit=libra awaiting weight input
  const [lbValue, setLbValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [facingMode, setFacingMode] = useState("environment");

  const [showList, setShowList] = useState(false); // detailed per-worker tally sheet
  const [showManual, setShowManual] = useState(false);
  const [editPrice, setEditPrice] = useState(false);
  const [listTab, setListTab] = useState("registro"); // "conteo" | "registro"

  // Workers who have check-in today — only they can be scanned/added
  const [checkedInIds, setCheckedInIds] = useState(new Set());
  const refreshCheckedIn = async () => {
    try {
      const { data } = await api.get("/attendance", { params: { date: todayKey } });
      const ids = new Set((data.rows || []).filter((r) => r.check_in).map((r) => r.worker_id));
      setCheckedInIds(ids);
      return ids;
    } catch (_) {
      return new Set();
    }
  };

  // Shared-basket mode: multiple workers split pieces until Save is pressed
  const [shareMode, setShareMode] = useState(false);
  const [shareBuffer, setShareBuffer] = useState([]); // [{id, name}] unique sharers
  const [shareBaskets, setShareBaskets] = useState(0); // # of baskets shared by this group
  const shareSessionIdRef = useRef(null); // id tagging scanLog entries of the current share group

  // Audit scan log — one entry per scan event (QR + manual). Persisted by date.
  const scanLogKey = `agriscan.scanlog.${todayKey}`;
  const [scanLog, setScanLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem(scanLogKey) || "[]"); }
    catch { return []; }
  });
  const logScan = (w, source, extra = {}) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workerId: w.id,
      name: w.name,
      at: new Date().toISOString(),
      source, // "qr" | "manual"
      priceAt: parseFloat(pricePerUnit) || 0,
      fraction: 1,
      ...extra,
    };
    setScanLog((prev) => {
      const next = [entry, ...prev].slice(0, 1000);
      try { localStorage.setItem(scanLogKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const lastRef = useRef({ code: "", at: 0 });
  const scannedCodesRef = useRef(new Map());
  const SCAN_COOLDOWN_MS = 2 * 60 * 1000;

  const normalizeCode = (s) => (s || "").toString().trim().toUpperCase();
  const extractCode = (raw) => {
    const s = (raw || "").toString().trim();
    if (s.includes("/")) return s.split("/").filter(Boolean).pop();
    if (s.includes(":")) return s.split(":").pop();
    return s;
  };

  // Resolve defaults (session → first → auto-create)
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
        // Prefer unit from Check-In session (Pieza/Libra/Horas toggle) over product default
        const sessionUnit = session.unitMode;
        const mappedUnit = sessionUnit === "libra" ? "libra" : sessionUnit === "horas" ? "hora" : sessionUnit === "pieza" ? "pieza" : null;
        setUnitLabel(mappedUnit || product.unit_label || "pieza");
        // Prefer price from Check-In session (localStorage) over the product's default
        // When unit is "horas", use pricePerHour; otherwise use pricePerUnit
        const sessionPrice = sessionUnit === "horas" ? session.pricePerHour : session.pricePerUnit;
        const hasSessionPrice = sessionPrice !== undefined && sessionPrice !== null && sessionPrice !== "" && !Number.isNaN(Number(sessionPrice));
        const pu = hasSessionPrice ? Number(sessionPrice) : (Number(product.price_per_unit) || 0);
        if (pu > 0) setPricePerUnit(String(pu));
        setReady(true);
        // Load today's attendance so we can gate scans by check-in
        try {
          const { data: att } = await api.get("/attendance", { params: { date: todayKey } });
          const ids = new Set((att.rows || []).filter((r) => r.check_in).map((r) => r.worker_id));
          setCheckedInIds(ids);
        } catch (_) {}
      } catch (_) {
        toast.error("No se pudo preparar la jornada");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const workersByQr = useMemo(() => {
    const map = {};
    workers.forEach((w) => {
      if (w.qr_code) map[normalizeCode(w.qr_code)] = w;
      if (w.id) map[normalizeCode(w.id)] = w;
      if (w.document_id) map[normalizeCode(w.document_id)] = w;
    });
    return map;
  }, [workers]);

  // === Camera lifecycle — stream kept alive; pause/resume avoids re-prompt ===
  const containerId = "qr-reader-fullscreen";
  const qrRef = useRef(null);
  const cameraStartedRef = useRef(false);
  const stopCamera = async () => {
    const s = qrRef.current;
    if (!s) return;
    try {
      if (s.getState && s.getState() === 2) await s.stop();
      await s.clear();
    } catch (_) {}
    qrRef.current = null;
    cameraStartedRef.current = false;
  };
  const startCamera = async () => {
    try {
      // Already running? Just resume decoding.
      if (qrRef.current && cameraStartedRef.current) {
        try { qrRef.current.resume(); } catch (_) {}
        return;
      }
      if (qrRef.current) await stopCamera();
      const s = new Html5Qrcode(containerId, { verbose: false });
      qrRef.current = s;
      await s.start(
        { facingMode },
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1.0 },
        (text) => handleScan(text),
        () => {}
      );
      cameraStartedRef.current = true;
    } catch (e) {
      toast.error("No se pudo abrir la cámara. Revisa permisos.");
      setScannerOn(false);
    }
  };

  // === Flash / Zoom / Flip camera controls ===
  const toggleTorch = async () => {
    const s = qrRef.current;
    if (!s) return;
    try {
      await s.applyVideoConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch (_) {
      toast.error("Flash no soportado en este dispositivo");
    }
  };
  const cycleZoom = async () => {
    const s = qrRef.current;
    if (!s) return;
    const next = zoomLevel >= 3 ? 1 : zoomLevel + 1;
    try {
      await s.applyVideoConstraints({ advanced: [{ zoom: next }] });
      setZoomLevel(next);
    } catch (_) {
      setZoomLevel(next); // still cycle the badge even if hw rejects
    }
  };
  const flipCamera = async () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    await stopCamera();
    // Will auto-restart via scannerOn useEffect — nudge:
    setTimeout(() => { if (scannerOn) startCamera(); }, 150);
  };
  const pauseCamera = () => {
    const s = qrRef.current;
    if (!s) return;
    try { s.pause(true); } catch (_) {}
  };
  useEffect(() => {
    if (!ready) return;
    if (scannerOn) startCamera();
    else pauseCamera();
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, scannerOn]);
  // Release camera only on real unmount (navigate away)
  useEffect(() => {
    return () => { stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = async (rawCode) => {
    const now = Date.now();
    if (lastRef.current.code === rawCode && now - lastRef.current.at < 1500) return;
    lastRef.current = { code: rawCode, at: now };

    const extracted = extractCode(rawCode);
    const key = normalizeCode(extracted);

    const lastAt = scannedCodesRef.current.get(key) || 0;
    const elapsed = now - lastAt;
    if (lastAt > 0 && elapsed < SCAN_COOLDOWN_MS && !shareMode) {
      // Cooldown applies only outside share mode (in share mode, re-scanning is intentional)
      const remaining = Math.ceil((SCAN_COOLDOWN_MS - elapsed) / 1000);
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      const label = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      toast.error(`⏱️ Espera ${label} antes de volver a escanear.`, { duration: 2200 });
      return;
    }

    let w = workersByQr[key];
    if (!w) {
      try {
        const { data } = await api.post("/workers/resolve", { code: rawCode });
        w = data;
        setWorkers((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]));
      } catch (_) {
        toast.error(`QR no registrado.`, { duration: 2500 });
        return;
      }
    }

    // In share mode, QR scans also join the group (sharing a basket among workers scanned)
    if (shareMode) {
      const alreadyIn = shareBuffer.some((x) => x.id === w.id);
      if (!alreadyIn) {
        if (!shareSessionIdRef.current) {
          shareSessionIdRef.current = `share-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        }
        setShareBuffer((prev) => [...prev, { id: w.id, name: w.name }]);
        setShareBaskets((n) => (n < 1 ? 1 : n));
        logScan(w, "qr", { sharedBasket: true, shareSessionId: shareSessionIdRef.current });
      }
      scannedCodesRef.current.set(key, now);
      playBeep();
      setLastWorker({ id: w.id, name: w.name });
      return;
    }

    scannedCodesRef.current.set(key, now);
    playBeep();
    setLastWorker({ id: w.id, name: w.name });
    if (unitLabel === "libra") {
      // Pound mode: ask for total weight instead of auto +1
      const cur = (tally[w.id] && tally[w.id].count) || 0;
      setLbValue(cur ? String(cur) : "");
      setLbPrompt({ id: w.id, name: w.name, source: "qr" });
      return;
    }
    setTally((prev) => {
      const cur = prev[w.id] || { name: w.name, count: 0 };
      return { ...prev, [w.id]: { name: w.name, count: cur.count + 1 } };
    });
    logScan(w, "qr");
    // Return to Cosecha — the worker name will appear on the GUARDAR button
    toast.success(`${w.name} escaneado`, { duration: 1200 });
    setTimeout(() => navigate(returnPath), 400);
  };

  const addManual = (workerId) => {
    const w = workers.find((x) => x.id === workerId);
    if (!w) return;
    playBeep();
    setLastWorker({ id: w.id, name: w.name });
    if (shareMode) {
      const alreadyIn = shareBuffer.some((x) => x.id === w.id);
      if (alreadyIn) {
        setShowManual(false);
        return;
      }
      if (!shareSessionIdRef.current) {
        shareSessionIdRef.current = `share-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      }
      setShareBuffer((prev) => [...prev, { id: w.id, name: w.name }]);
      setShareBaskets((n) => (n < 1 ? 1 : n));
      logScan(w, "manual", { sharedBasket: true, shareSessionId: shareSessionIdRef.current });
      setShowManual(false);
      return;
    }
    if (unitLabel === "libra") {
      const cur = (tally[w.id] && tally[w.id].count) || 0;
      setLbValue(cur ? String(cur) : "");
      setLbPrompt({ id: w.id, name: w.name, source: "manual" });
      setShowManual(false);
      return;
    }
    setTally((prev) => {
      const cur = prev[w.id] || { name: w.name, count: 0 };
      return { ...prev, [w.id]: { name: w.name, count: cur.count + 1 } };
    });
    logScan(w, "manual");
    setShowManual(false);
  };

  const confirmLbInput = () => {
    if (!lbPrompt) return;
    const val = parseFloat(lbValue);
    if (!val || val <= 0) {
      toast.error("Ingresa un peso válido");
      return;
    }
    const w = { id: lbPrompt.id, name: lbPrompt.name };
    setTally((prev) => ({ ...prev, [w.id]: { name: w.name, count: +val.toFixed(2) } }));
    logScan(w, lbPrompt.source || "manual", { weightLb: +val.toFixed(2) });
    setLbPrompt(null);
    setLbValue("");
  };

  // Remove a scan log entry (e.g. scanned by mistake). Also reverts the tally
  // and, if the scan was already saved to the backend, deletes the server harvest.
  const deleteScan = async (entry) => {
    if (!entry) return;
    if (!window.confirm(`¿Borrar el escaneo de ${entry.name}?`)) return;
    const frac = typeof entry.fraction === "number" ? entry.fraction : 1;
    const isShared = entry.sharedBasket === true;
    // Revert tally (skip shared-basket pending entries — they aren't in tally until commit)
    if (!isShared || entry.earned !== undefined) {
      const delta = entry.weightLb !== undefined ? -Number(entry.weightLb)
        : isShared ? -Number(entry.sharePieces || 0)
        : -frac;
      bump(entry.workerId, delta);
    }
    // If already persisted, delete the server-side harvest too (may be locked by a saved receipt)
    if (entry.harvestId) {
      try {
        await api.delete(`/harvests/${entry.harvestId}`);
      } catch (err) {
        const detail = err?.response?.data?.detail || "No se pudo borrar";
        toast.error(detail);
        return; // keep the scan in the log; it's still tied to a protected record
      }
    }
    // Remove entry from log
    setScanLog((prev) => {
      const next = prev.filter((e) => e.id !== entry.id);
      try { localStorage.setItem(scanLogKey, JSON.stringify(next)); } catch {}
      return next;
    });
    toast.success("Escaneo borrado");
  };

  // Commit shared basket on save: distribute (shareBaskets / N) to each sharer
  const commitSharedBasket = () => {
    if (shareBuffer.length === 0 || shareBaskets <= 0) return 0;
    const share = shareBaskets / shareBuffer.length;
    const priceAtNow = parseFloat(pricePerUnit) || 0;
    const earnedPerSharer = share * priceAtNow;
    const sessionId = shareSessionIdRef.current;
    setTally((prev) => {
      const next = { ...prev };
      shareBuffer.forEach((w) => {
        const cur = next[w.id] || { name: w.name, count: 0 };
        next[w.id] = { name: w.name, count: +(cur.count + share).toFixed(4) };
      });
      return next;
    });
    // Patch scanLog entries of this session with real earned amount + metadata
    if (sessionId) {
      setScanLog((prev) => {
        const next = prev.map((e) =>
          e.shareSessionId === sessionId
            ? {
                ...e,
                earned: +earnedPerSharer.toFixed(2),
                baskets: shareBaskets,
                sharers: shareBuffer.length,
                sharePieces: +share.toFixed(4),
              }
            : e
        );
        try { localStorage.setItem(scanLogKey, JSON.stringify(next)); } catch {}
        return next;
      });
    }
    const n = shareBuffer.length;
    setShareBuffer([]);
    setShareBaskets(0);
    setShareMode(false);
    shareSessionIdRef.current = null;
    return n;
  };

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

  // Mark the LAST scanned piece as a fraction. Default scan adds +1 (completo).
  // Tapping these buttons adjusts the last +1 to the chosen fraction.
  // Example: 1/2 -> delta = 0.5 - 1 = -0.5 so last entry becomes 0.5 instead of 1.
  const markLastAs = (fraction) => {
    if (!lastWorker) {
      toast.error("Primero escanea un trabajador");
      return;
    }
    if (shareMode) {
      // In share mode, set the shared basket count directly
      setShareBaskets(fraction);
      return;
    }
    const delta = fraction - 1;
    if (delta !== 0) bump(lastWorker.id, delta);
    // Patch the latest scanLog entry for this worker (newest first in the array)
    setScanLog((prev) => {
      const idx = prev.findIndex((e) => e.workerId === lastWorker.id && !e.sharedBasket);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], fraction };
      try { localStorage.setItem(scanLogKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const resetTally = () => {
    if (Object.keys(tally).length === 0) return;
    if (!window.confirm("¿Reiniciar conteos?")) return;
    setTally({});
    setLastWorker(null);
  };

  const totals = useMemo(() => {
    const entries = Object.entries(tally);
    const units = entries.reduce((a, [, v]) => a + v.count, 0);
    const payment = units * (parseFloat(pricePerUnit) || 0);
    return { units, payment, workers: entries.length };
  }, [tally, pricePerUnit]);

  const lastWorkerStats = useMemo(() => {
    if (!lastWorker) return null;
    const row = tally[lastWorker.id];
    if (!row) return { name: lastWorker.name, count: 0, payment: 0 };
    const payment = row.count * (parseFloat(pricePerUnit) || 0);
    return { name: row.name, count: row.count, payment };
  }, [lastWorker, tally, pricePerUnit]);

  // Aggregate scanLog per worker (full day, saved + unsaved)
  const scanLogByWorker = useMemo(() => {
    const agg = {}; // id -> {name, count}
    for (const e of scanLog) {
      const key = e.workerId || e.name;
      if (!agg[key]) agg[key] = { name: e.name, count: 0 };
      agg[key].count += 1;
    }
    const price = parseFloat(pricePerUnit) || 0;
    return Object.entries(agg)
      .map(([id, v]) => ({ id, name: v.name, count: v.count, payment: v.count * price }))
      .sort((a, b) => b.count - a.count);
  }, [scanLog, pricePerUnit]);
  const totalScanned = scanLog.length;

  const save = async () => {
    const price = parseFloat(pricePerUnit) || 0;
    const hasShare = shareBuffer.length > 0 && shareBaskets > 0;
    const sharePieces = hasShare ? shareBaskets / shareBuffer.length : 0;
    const earnedPerSharer = +(sharePieces * price).toFixed(2);

    // Build per-worker list of individual harvests (one row per scan)
    const logByWorker = {};
    scanLog.filter((e) => !e.sharedBasket).forEach((e) => {
      const u = e.weightLb !== undefined ? Number(e.weightLb)
        : (typeof e.fraction === "number" ? e.fraction : 1);
      if (!logByWorker[e.workerId]) logByWorker[e.workerId] = [];
      logByWorker[e.workerId].push({ units: +u.toFixed(4), source: e.source || "qr" });
    });
    if (hasShare) {
      shareBuffer.forEach((w) => {
        if (!logByWorker[w.id]) logByWorker[w.id] = [];
        logByWorker[w.id].push({ units: +sharePieces.toFixed(4), source: "shared" });
      });
    }
    // Reconcile with tally: any extra piezas from manual +/- that aren't in the log
    // become one compensating row per worker so nothing is lost.
    Object.entries(tally).forEach(([wid, v]) => {
      const logged = (logByWorker[wid] || []).reduce((s, x) => s + x.units, 0);
      const delta = +(v.count - logged).toFixed(4);
      if (delta > 0.001) {
        if (!logByWorker[wid]) logByWorker[wid] = [];
        logByWorker[wid].push({ units: delta, source: "manual-adjust" });
      }
    });

    const posts = [];
    Object.entries(logByWorker).forEach(([wid, items]) => {
      items.forEach((item) => {
        if (item.units <= 0) return;
        posts.push(api.post("/harvests", {
          worker_id: wid,
          parcel_id: parcelId,
          product_id: productId,
          kilos: 0,
          units: item.units,
          price_per_kg: 0,
          price_per_unit: price,
          price_mode: "piece",
          date: todayKey,
          photo_path: "",
          notes: item.source === "shared" ? "Canasta compartida" : "Cosecha escaneada",
        }));
      });
    });

    if (posts.length === 0) {
      toast.error("No hay escaneos para guardar");
      return;
    }
    if (price <= 0) {
      toast.error("Pon el precio antes de guardar");
      return;
    }

    setSaving(true);
    try {
      // POST all; keep per-entry id so we can patch scanLog with harvestId mapping
      const results = await Promise.all(
        posts.map((p) => p.then((r) => r.data).catch((err) => { throw err; }))
      );
      // Rebuild a flat list in the same order posts were enqueued
      // and map each post back to its scanLog entry (if any) so we can
      // later delete the server-side harvest from the Registro.
      const assignments = [];
      Object.entries(logByWorker).forEach(([wid, items]) => {
        items.forEach((item) => {
          if (item.units <= 0) return;
          assignments.push({ wid, source: item.source });
        });
      });
      const harvestIdByScan = new Map(); // scanLog.id -> harvestId
      // Walk assignments against today's scanLog (non-shared) and shared buffer entries
      const nonSharedByWorker = {};
      scanLog.filter((e) => !e.sharedBasket).forEach((e) => {
        if (!nonSharedByWorker[e.workerId]) nonSharedByWorker[e.workerId] = [];
        nonSharedByWorker[e.workerId].push(e);
      });
      const sharedByWorker = {};
      scanLog.filter((e) => e.sharedBasket && e.shareSessionId === shareSessionIdRef.current).forEach((e) => {
        if (!sharedByWorker[e.workerId]) sharedByWorker[e.workerId] = [];
        sharedByWorker[e.workerId].push(e);
      });
      assignments.forEach((a, idx) => {
        const harvest = results[idx];
        const hid = harvest && (harvest.id || harvest._id);
        if (!hid) return;
        let picked = null;
        if (a.source === "shared") {
          const q = sharedByWorker[a.wid];
          picked = q && q.shift();
        } else if (a.source !== "manual-adjust") {
          const q = nonSharedByWorker[a.wid];
          picked = q && q.shift();
        }
        if (picked) harvestIdByScan.set(picked.id, hid);
      });

      // Persist harvestId on each matching scanLog entry
      const sessionId = shareSessionIdRef.current;
      setScanLog((prev) => {
        const next = prev.map((e) => {
          const hid = harvestIdByScan.get(e.id);
          const patched = { ...e };
          if (hid) patched.harvestId = hid;
          if (sessionId && e.sharedBasket && e.shareSessionId === sessionId) {
            patched.earned = earnedPerSharer;
            patched.baskets = shareBaskets;
            patched.sharers = shareBuffer.length;
            patched.sharePieces = +sharePieces.toFixed(4);
          }
          return patched;
        });
        try { localStorage.setItem(scanLogKey, JSON.stringify(next)); } catch {}
        return next;
      });

      const totalPayment = Object.values(logByWorker).flat().reduce((s, x) => s + x.units * price, 0);
      toast.success(`Guardado: ${posts.length} registro(s) · ${formatCurrency(totalPayment)}`, { duration: 2500 });
      setTally({});
      setShareBuffer([]);
      setShareBaskets(0);
      setShareMode(false);
      shareSessionIdRef.current = null;
      setLastWorker(null);
      scannedCodesRef.current.clear();
      setScannerOn(true);
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
    <div className="fixed inset-0 z-50 bg-black flex flex-col select-none" data-testid="scan-harvest-mode">
      {/* Camera body — full-bleed */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <div id={containerId} className="absolute inset-0" />

        {/* Floating X close button (top-right) */}
        <button
          onClick={() => navigate(returnPath)}
          className="absolute top-[max(env(safe-area-inset-top),16px)] right-4 w-11 h-11 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm z-10"
          data-testid="scan-close-fullscreen"
          aria-label="Cerrar"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Top hint text */}
        <div className="pointer-events-none absolute top-[max(env(safe-area-inset-top),20px)] left-0 right-16 flex justify-center">
          <p className="text-white text-base font-semibold text-center px-4 drop-shadow-lg mt-16" style={{ fontFamily: "Outfit, sans-serif" }}>
            Desliza hacia arriba/abajo<br />para hacer zoom
          </p>
        </div>

        {/* QR targeting frame — clean white square with scanning line */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-[75%] max-w-sm aspect-square">
            <span className="absolute top-0 left-0 w-10 h-10 border-t-[3px] border-l-[3px] border-white rounded-tl-md" />
            <span className="absolute top-0 right-0 w-10 h-10 border-t-[3px] border-r-[3px] border-white rounded-tr-md" />
            <span className="absolute bottom-0 left-0 w-10 h-10 border-b-[3px] border-l-[3px] border-white rounded-bl-md" />
            <span className="absolute bottom-0 right-0 w-10 h-10 border-b-[3px] border-r-[3px] border-white rounded-br-md" />
            {/* Scanning line */}
            <div className="absolute left-2 right-2 top-1/2 h-[2px] bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
          </div>
        </div>

        {/* Manual barcode entry button */}
        <button
          onClick={() => setShowManual(true)}
          className="absolute left-1/2 -translate-x-1/2 bottom-[110px] px-6 py-3 rounded-full border-2 border-white text-white font-semibold text-sm bg-transparent hover:bg-white/10 active:scale-[0.98] whitespace-nowrap"
          data-testid="scan-manual-entry"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          Introducir código de barras manualmente
        </button>

        {/* Bottom row: Flash · Zoom · Flip camera */}
        <div className="absolute left-0 right-0 bottom-[max(env(safe-area-inset-bottom),20px)] flex items-center justify-around px-10">
          <button
            onClick={toggleTorch}
            className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-sm ${torchOn ? "bg-amber-400 text-black" : "bg-black/40 text-white hover:bg-black/60"}`}
            data-testid="scan-torch-btn"
            aria-label="Flash"
          >
            {torchOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
          </button>
          <button
            onClick={cycleZoom}
            className="w-12 h-12 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm font-extrabold"
            data-testid="scan-zoom-btn"
            aria-label="Zoom"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            {zoomLevel}
          </button>
          <button
            onClick={flipCamera}
            className="w-12 h-12 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm"
            data-testid="scan-flip-btn"
            aria-label="Cambiar cámara"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* No bottom bar — scanner is minimal and auto-returns to Dashboard on successful scan */}

      {/* Edit price modal */}
      {editPrice && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={() => setEditPrice(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()} data-testid="scan-edit-price-modal">
            <h3 className="text-lg font-extrabold text-[#1A2210] mb-3" style={{ fontFamily: "Outfit, sans-serif" }}>
              Precio por {unitLabel}
            </h3>
            <div className="relative">
              <DollarSign className="w-5 h-5 text-[#889078] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
                autoFocus
                placeholder="0.00"
                className="field-input !h-14 !text-2xl font-mono-stat w-full !pl-10"
                data-testid="scan-edit-price-input"
              />
            </div>
            <button
              onClick={() => setEditPrice(false)}
              className="w-full h-12 rounded-xl bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-extrabold mt-4"
              data-testid="scan-edit-price-done"
            >
              Listo
            </button>
          </div>
        </div>
      )}

      {/* Manual add modal */}
      {showManual && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={() => setShowManual(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()} data-testid="scan-manual-modal">
            <h3 className="text-lg font-extrabold text-[#1A2210] mb-3" style={{ fontFamily: "Outfit, sans-serif" }}>
              Agregar +1 manual
            </h3>
            <select
              defaultValue=""
              onChange={(e) => { if (e.target.value) addManual(e.target.value); }}
              className="field-input !h-14 !text-base w-full"
              data-testid="scan-manual-select"
              autoFocus
            >
              <option value="">— Elegir trabajador —</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button
              onClick={() => setShowManual(false)}
              className="w-full h-11 rounded-xl bg-[#F0EDE1] hover:bg-[#E2DDD0] text-[#556047] font-bold mt-4"
              data-testid="scan-manual-cancel"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Pound-weight input modal (when unit = libra) */}
      {lbPrompt && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={() => { setLbPrompt(null); setLbValue(""); }}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()} data-testid="scan-lb-modal">
            <h3 className="text-lg font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
              Total de libras
            </h3>
            <p className="text-sm text-[#556047] font-semibold mb-3">
              Para <b>{lbPrompt.name}</b>
            </p>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={lbValue}
              onChange={(e) => setLbValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmLbInput(); }}
              className="field-input !h-16 !text-3xl !font-mono-stat !font-extrabold text-center w-full"
              placeholder="0.0"
              data-testid="scan-lb-input"
              autoFocus
            />
            <div className="text-center text-[11px] text-[#889078] font-bold uppercase tracking-wider mt-1">
              libras · ${pricePerUnit || 0} c/u → <span className="text-[#1D4ED8]">{formatCurrency((parseFloat(lbValue) || 0) * (parseFloat(pricePerUnit) || 0))}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                onClick={() => { setLbPrompt(null); setLbValue(""); }}
                className="h-12 rounded-xl bg-[#F0EDE1] hover:bg-[#E2DDD0] text-[#556047] font-bold"
                data-testid="scan-lb-cancel"
              >
                Cancelar
              </button>
              <button
                onClick={confirmLbInput}
                className="h-12 rounded-xl bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-extrabold"
                data-testid="scan-lb-confirm"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List sheet — tabs: Conteo + Registro */}
      {showList && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setShowList(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="scan-list-modal">
            <div className="flex items-center justify-between px-4 h-14 border-b border-[#E2DDD0]">
              <h3 className="text-lg font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
                Jornada
              </h3>
              <button
                onClick={() => setShowList(false)}
                className="w-9 h-9 rounded-full bg-[#F0EDE1] hover:bg-[#E2DDD0] flex items-center justify-center"
                data-testid="scan-list-close"
              >
                <X className="w-5 h-5 text-[#556047]" />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-3 pt-3 pb-2 flex gap-2">
              <button
                onClick={() => setListTab("registro")}
                className={`flex-1 h-11 rounded-xl font-bold text-sm transition-colors ${
                  listTab === "registro"
                    ? "bg-[#2B55D1] text-white shadow-md"
                    : "bg-[#F0EDE1] text-[#556047] hover:bg-[#E2DDD0]"
                }`}
                data-testid="scan-tab-registro"
              >
                Empleados activos ({scanLogByWorker.length})
              </button>
              <button
                onClick={() => setListTab("conteo")}
                className={`flex-1 h-11 rounded-xl font-bold text-sm transition-colors ${
                  listTab === "conteo"
                    ? "bg-[#2B55D1] text-white shadow-md"
                    : "bg-[#F0EDE1] text-[#556047] hover:bg-[#E2DDD0]"
                }`}
                data-testid="scan-tab-conteo"
              >
                Conteo ({totalScanned})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-3">
              {listTab === "conteo" ? (
                scanLogByWorker.length === 0 ? (
                  <p className="text-sm text-[#556047] font-semibold py-6 text-center" data-testid="scan-conteo-empty">
                    Aún no hay piezas escaneadas hoy.
                  </p>
                ) : (
                  <>
                    <div className="text-[11px] text-[#556047] font-semibold py-2 flex items-center justify-between">
                      <span>Total hoy: <b className="text-[#1A2210] font-mono-stat">{totalScanned}</b> piezas</span>
                      <span>Mayor arriba</span>
                    </div>
                    <div className="divide-y divide-[#E2DDD0]">
                      {scanLogByWorker.map((r) => {
                        const pendingRow = tally[r.id];
                        return (
                          <div key={r.id} className="py-3 flex items-center justify-between gap-3" data-testid={`scan-tally-row-${r.id}`}>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-[#1A2210] truncate flex items-center gap-1.5">
                                {r.name}
                                {pendingRow && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#DC2626]/15 text-[#DC2626]">
                                    {formatNumber(pendingRow.count, pendingRow.count % 1 === 0 ? 0 : 2)} sin guardar
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[#556047] font-semibold">
                                {formatNumber(r.count, 0)} pieza{r.count !== 1 ? "s" : ""} • <span className="text-[#1D4ED8] font-bold">{formatCurrency(r.payment)}</span>
                              </div>
                            </div>
                            {pendingRow && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => bump(r.id, -1)}
                                  className="w-9 h-9 rounded-xl bg-white border-2 border-[#E2DDD0] hover:bg-red-50 hover:border-red-200 text-red-600 flex items-center justify-center"
                                  data-testid={`scan-dec-${r.id}`}
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => bump(r.id, 1)}
                                  className="w-9 h-9 rounded-xl bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white flex items-center justify-center"
                                  data-testid={`scan-inc-${r.id}`}
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )
              ) : (
                /* REGISTRO TAB */
                scanLog.length === 0 ? (
                  <p className="text-sm text-[#556047] font-semibold py-6 text-center" data-testid="scan-registro-empty">
                    Aún no se ha escaneado a nadie hoy.
                  </p>
                ) : (
                  <>
                    <div className="text-[11px] text-[#556047] font-semibold py-2 flex items-center justify-between">
                      <span>Fecha: <b className="text-[#1A2210]">{new Date(todayKey + "T00:00:00").toLocaleDateString()}</b></span>
                      <span>Más reciente arriba</span>
                    </div>
                    <ul className="divide-y divide-[#E2DDD0]" data-testid="scan-registro-list">
                      {scanLog.map((e) => {
                        const d = new Date(e.at);
                        const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                        const date = d.toLocaleDateString();
                        const basePrice = Number(e.priceAt ?? pricePerUnit) || 0;
                        const frac = typeof e.fraction === "number" ? e.fraction : 1;
                        const earned = e.earned !== undefined ? Number(e.earned) : basePrice * frac;
                        const isShared = e.sharedBasket === true;
                        const pending = isShared && e.earned === undefined;
                        const fracLabel = frac === 1 ? "" : frac === 0.5 ? "½" : frac === 0.75 ? "¾" : frac === 0.25 ? "¼" : frac.toFixed(2);
                        return (
                          <li key={e.id} className="py-2.5 flex items-center justify-between gap-3" data-testid={`scan-registro-row-${e.id}`}>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-[#1A2210] truncate flex items-center gap-1.5 flex-wrap">
                                {e.name}
                                <span
                                  className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                    e.source === "manual"
                                      ? "bg-[#DC2626]/15 text-[#DC2626]"
                                      : "bg-[#1D4ED8]/15 text-[#1D4ED8]"
                                  }`}
                                >
                                  {e.source === "manual" ? "Manual" : "QR"}
                                </span>
                                {fracLabel && !isShared && (
                                  <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1D4ED8]/15 text-[#1D4ED8]">
                                    {fracLabel}
                                  </span>
                                )}
                                {isShared && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E65100]/15 text-[#E65100]">
                                    Compartida{e.sharers ? ` ·${e.sharers}` : ""}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#556047] font-semibold font-mono-stat">
                                {date} · {time}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`font-mono-stat text-base font-extrabold ${pending ? "text-[#889078]" : "text-[#1D4ED8]"}`} data-testid={`scan-registro-earned-${e.id}`}>
                                {pending ? "—" : formatCurrency(earned)}
                              </div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-[#889078] leading-none">
                                {pending ? "sin guardar" : (isShared ? `${e.sharePieces?.toFixed(2) || "—"} pza` : (frac === 1 ? "/pza" : `${frac} pza`))}
                              </div>
                            </div>
                            <button
                              onClick={() => deleteScan(e)}
                              className="w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center shrink-0"
                              data-testid={`scan-registro-delete-${e.id}`}
                              title="Borrar escaneo"
                              aria-label="Borrar escaneo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )
              )}
            </div>

            {listTab === "conteo" && (
              <div className="px-4 py-3 border-t border-[#E2DDD0] bg-[#F7F5EE] flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#556047]">Total jornada</div>
                  <div className="font-mono-stat text-xl text-[#1A2210]">{formatCurrency(totals.payment)}</div>
                </div>
                <button
                  onClick={() => { setShowList(false); save(); }}
                  disabled={saving || Object.keys(tally).length === 0}
                  className="h-12 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-extrabold flex items-center gap-1.5 disabled:opacity-50"
                  data-testid="scan-list-save"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Guardar</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
