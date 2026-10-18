import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, Printer, Loader2, ArrowLeft, Trash2, X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail, formatCurrency, todayISO, fetchCheckinSession } from "@/lib/api";
import QrScanner from "@/components/QrScanner";
import { thermalPrinter } from "@/lib/thermalPrinter";
import { openHtmlWindow, escapeHtml } from "@/lib/printHtml";

const FRACTIONS = [["1/4", 0.25], ["1/2", 0.5], ["3/4", 0.75]];
const TIPO = { pieza: "Pieza", libra: "Libra", horas: "Horas" };
const unitOf = (h) => (TIPO[h.unit_type] || (h.price_mode === "hour" ? "Horas" : "Pieza")).toLowerCase();

async function printWorkerTicket(rec, rows) {
  const mine = rows.filter((r) => r.worker_id === rec.worker_id).slice().reverse();
  const total = mine.reduce((s, r) => s + Number(r.payment || 0), 0);
  const byUnit = {};
  mine.forEach((r) => { byUnit[unitOf(r)] = (byUnit[unitOf(r)] || 0) + Number(r.units || 0); });
  const totalQty = Object.entries(byUnit).map(([u, q]) => `${Math.round(q * 100) / 100} ${u}`).join(" · ");
  const lines = mine.map((r) => ({ when: fmtStamp(r), qty: `${r.units} ${unitOf(r)} x ${formatCurrency(r.price_per_unit)}`, pay: formatCurrency(r.payment) }));
  if (thermalPrinter.isSupported?.()) {
    try {
      if (!thermalPrinter.isConnected()) await thermalPrinter.connect();
      const sep = "-".repeat(32);
      const pad = (l, r) => l + " ".repeat(Math.max(1, 32 - l.length - r.length)) + r;
      await thermalPrinter.print([
        { text: "AgriScan", align: "center", bold: true, size: "double" },
        { text: rec.date, align: "center" }, { text: sep },
        { text: rec.worker_name, bold: true }, { text: sep },
        ...lines.flatMap((l) => [{ text: l.when }, { text: pad("  " + l.qty, l.pay) }]),
        { text: sep }, { text: pad("Total:", totalQty) },
        { text: "GANO", align: "center", bold: true },
        { text: formatCurrency(total), align: "center", size: "double", bold: true },
      ]);
      toast.success(`Ticket enviado: ${rec.worker_name}`);
      return;
    } catch (e) {
      console.warn("bluetooth print", e);
    }
  }
  const body = lines.map((l) => `<div>${escapeHtml(l.when)}</div><div class="r"><span>${escapeHtml(l.qty)}</span><span>${escapeHtml(l.pay)}</span></div>`).join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ticket</title><style>@page{size:58mm auto;margin:3mm}body{font-family:'Courier New',monospace;font-size:12px;width:52mm;margin:0 auto}h1{text-align:center;font-size:16px;margin:4px 0}.c{text-align:center}.r{display:flex;justify-content:space-between;margin-bottom:4px}hr{border:none;border-top:1px dashed #000}.big{font-size:20px;font-weight:bold;text-align:center}</style></head><body><h1>AgriScan</h1><div class="c">${escapeHtml(rec.date)}</div><hr><b>${escapeHtml(rec.worker_name)}</b><hr>${body}<hr><div class="r"><span>Total:</span><span>${escapeHtml(totalQty)}</span></div><div class="c"><b>GANÓ</b></div><div class="big">${escapeHtml(formatCurrency(total))}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
  if (!openHtmlWindow(html, "width=400,height=700")) toast.error("Permite ventanas emergentes para imprimir");
}

function Row({ label, children, testid }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-[#ECECEC] bg-white" data-testid={testid}>
      <span className="text-[17px] text-[#4B5563]">{label}</span>
      {children}
    </div>
  );
}

function EmployeeInput({ worker, workers, onPick, onClear, onCreated }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { if (worker) { setText(worker.name); } }, [worker]);
  const q = text.trim().toLowerCase();
  const matches = q ? workers.filter((w) => w.name.toLowerCase().includes(q)).slice(0, 6) : [];
  const exact = workers.some((w) => w.name.toLowerCase() === q);
  const pick = (w) => { onPick(w); setOpen(false); };
  const createNew = async () => {
    try {
      const { data } = await api.post("/workers", { name: text.trim() });
      onCreated(data);
      pick({ id: data.id, name: data.name });
      toast.success(`Empleado agregado: ${data.name}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo agregar");
    }
  };
  return (
    <div className="relative flex-1 min-w-0 flex justify-end items-center gap-1">
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); if (worker) onClear(); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Empleado"
        className="w-full text-right text-[19px] bg-transparent outline-none text-[#111827] placeholder:text-[#C4C4C4]"
        data-testid="quick-employee-input"
      />
      {text && <button onClick={() => { setText(""); onClear(); }} className="text-[#9CA3AF]" data-testid="quick-employee-clear"><X className="w-4 h-4" /></button>}
      {open && q && !worker && (
        <div className="absolute right-0 top-full mt-2 w-64 max-w-[80vw] bg-white rounded-xl shadow-lg border border-[#E5E7EB] z-20 overflow-hidden" data-testid="quick-employee-suggestions">
          {matches.map((w) => (
            <button key={w.id} onMouseDown={() => pick(w)} className="block w-full text-left px-4 py-3 hover:bg-[#F3F4F6] text-[#111827] border-b border-[#F3F4F6]" data-testid={`quick-employee-option-${w.id}`}>{w.name}</button>
          ))}
          {!exact && (
            <button onMouseDown={createNew} className="flex items-center gap-2 w-full text-left px-4 py-3 text-[#1D4ED8] font-semibold hover:bg-[#EFF6FF]" data-testid="quick-employee-create">
              <UserPlus className="w-4 h-4" /> Agregar "{text.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EditRecord({ rec, onClose, onDone }) {
  const [qty, setQty] = useState(String(rec.units));
  const [busy, setBusy] = useState(false);
  const run = async (fn, msg) => {
    setBusy(true);
    try { await fn(); toast.success(msg); onDone(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo completar"); }
    finally { setBusy(false); }
  };
  const update = () => {
    const units = Number(qty);
    if (!(units > 0)) { toast.error("Cantidad no válida"); return; }
    run(() => api.put(`/harvests/${rec.id}`, {
      worker_id: rec.worker_id, parcel_id: rec.parcel_id, product_id: rec.product_id,
      kilos: rec.kilos || 0, units, price_per_kg: rec.price_per_kg || 0, price_per_unit: rec.price_per_unit,
      date: rec.date, photo_path: rec.photo_path || "", notes: rec.notes || "",
      block: rec.block || "", variety: rec.variety || "", mayordomo: rec.mayordomo || "", unit_type: rec.unit_type || "",
    }), "Registro corregido");
  };
  const remove = () => { if (window.confirm(`¿Borrar el registro de ${rec.worker_name}?`)) run(() => api.delete(`/harvests/${rec.id}`), "Registro borrado"); };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose} data-testid="quick-edit-dialog">
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-[#111827] truncate">{rec.worker_name}</h3>
          <button onClick={onClose} data-testid="quick-edit-close"><X className="w-5 h-5 text-[#6B7280]" /></button>
        </div>
        <label className="block text-sm text-[#4B5563]">Cantidad</label>
        <div className="flex gap-2">
          {FRACTIONS.map(([l, v]) => (
            <button key={l} onClick={() => setQty(String(v))} className={`px-3 py-1.5 rounded-md text-sm font-semibold ${Number(qty) === v ? "bg-[#9BC53D] text-white" : "bg-[#E5E7EB] text-[#6B7280]"}`} data-testid={`quick-edit-frac-${l.replace("/", "-")}`}>{l}</button>
          ))}
          <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="flex-1 min-w-0 border border-[#D1D5DB] rounded-md px-3 text-right text-lg outline-none focus:border-[#9BC53D]" data-testid="quick-edit-qty" />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={remove} disabled={busy} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FEE2E2] text-[#B91C1C] font-bold disabled:opacity-60" data-testid="quick-edit-delete"><Trash2 className="w-4 h-4" /> Borrar</button>
          <button onClick={update} disabled={busy} className="flex-1 py-3 rounded-xl bg-[#9BC53D] text-white font-bold disabled:opacity-60" data-testid="quick-edit-save">{busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}

function fmtStamp(h) {
  const d = h.created_at ? new Date(h.created_at) : null;
  if (!d || isNaN(d)) return h.date || "";
  return `${d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" })} · ${d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

function Records({ rows, loading, onBack, onSelect, onDeleted }) {
  const remove = async (h) => {
    if (!window.confirm(`¿Borrar el escaneo de ${h.worker_name}?`)) return;
    try {
      await api.delete(`/harvests/${h.id}`);
      toast.success("Escaneo borrado");
      onDeleted();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo borrar");
    }
  };
  return (
    <div className="flex-1 overflow-y-auto bg-[#E9E9E9]" data-testid="quick-records">
      <button onClick={onBack} className="flex items-center gap-2 px-4 py-3 text-[#1D4ED8] font-bold" data-testid="quick-records-back">
        <ArrowLeft className="w-5 h-5" /> Escanear
      </button>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8]" /></div>
      ) : rows.length === 0 ? (
        <p className="text-center text-[#6B7280] py-10 font-semibold">Sin registros hoy</p>
      ) : (
        rows.map((h) => (
          <div key={h.id} className="flex items-center bg-white border-b border-[#ECECEC]" data-testid={`quick-record-${h.id}`}>
          <button onClick={() => onSelect(h)} className="flex-1 min-w-0 text-left flex items-center justify-between pl-4 pr-2 py-3 hover:bg-[#F9FAFB]" data-testid={`quick-record-edit-${h.id}`}>
            <div className="min-w-0">
              <div className="font-semibold text-[#111827] truncate">{h.worker_name}</div>
              <div className="text-xs text-[#6B7280]" data-testid={`quick-record-time-${h.id}`}>{fmtStamp(h)}</div>
              <div className="text-xs text-[#4B5563]" data-testid={`quick-record-detail-${h.id}`}>{h.units} {unitOf(h)} · {formatCurrency(h.price_per_unit)} c/u</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wide text-[#6B7280]">Ganó</div>
              <div className="font-bold text-[#15803D] font-mono-stat" data-testid={`quick-record-pay-${h.id}`}>{formatCurrency(h.payment)}</div>
            </div>
          </button>
          <button onClick={() => printWorkerTicket(h, rows)} className="p-3 text-[#1D4ED8] hover:bg-[#EFF6FF]" aria-label="Imprimir" data-testid={`quick-record-print-${h.id}`}><Printer className="w-5 h-5" /></button>
          <button onClick={() => remove(h)} className="p-3 pr-4 text-[#DC2626] hover:bg-[#FEF2F2]" aria-label="Borrar" data-testid={`quick-record-delete-${h.id}`}><Trash2 className="w-5 h-5" /></button>
          </div>
        ))
      )}
    </div>
  );
}

export default function QuickHarvest() {
  const navigate = useNavigate();
  const today = todayISO();
  const [session, setSession] = useState({});
  const [scanning, setScanning] = useState(false);
  const [worker, setWorker] = useState(null);
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("scan");
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [editing, setEditing] = useState(null);
  const scanLock = useRef(false);

  const mode = session.unitMode || "pieza";
  const price = Number(mode === "horas" ? session.pricePerHour : session.pricePerUnit) || 0;

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    try {
      const { data } = await api.get("/harvests", { params: { date_from: today, date_to: today } });
      setRows([...(data || [])].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))));
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudieron cargar los registros");
    } finally {
      setLoadingRows(false);
    }
  }, [today]);

  useEffect(() => { fetchCheckinSession(today).then((s) => setSession(s || {})); }, [today]);
  useEffect(() => { if (view === "records") loadRows(); }, [view, loadRows]);
  useEffect(() => {
    api.get("/workers").then(({ data }) => setWorkers((data || []).filter((w) => w.active !== false))).catch((e) => console.error("workers", e));
  }, []);

  const pickWorker = (w) => {
    if (!session.parcelId || !session.productId || price <= 0) { openScanner(); return; }
    setWorker(w);
    setQty("1");
  };

  const openScanner = () => {
    if (!session.parcelId || !session.productId || price <= 0) {
      toast.error("Completa primero el Check in (Rancho, Trabajo y Precio)");
      navigate("/asistencia");
      return;
    }
    scanLock.current = false;
    setScanning(true);
  };

  const onScan = async (code) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setScanning(false);
    try {
      const { data } = await api.post("/workers/resolve", { code });
      setWorker({ id: data.id, name: data.name });
      setQty("1");
    } catch (_) {
      toast.error("QR no registrado");
    }
  };

  const save = async () => {
    const units = Number(qty);
    if (!worker || !(units > 0)) { toast.error("Escanea o escribe un empleado y pon la cantidad"); return; }
    setSaving(true);
    try {
      await api.post("/harvests", {
        worker_id: worker.id, parcel_id: session.parcelId, product_id: session.productId,
        kilos: 0, units, price_per_kg: 0, price_per_unit: price, price_mode: mode === "horas" ? "hour" : "piece", unit_type: mode,
        date: today, photo_path: "", notes: "Cosecha escaneada",
        block: session.block || "", variety: session.variedad || "", mayordomo: session.mayordomo || "",
      });
      toast.success(`Guardado: ${worker.name} · ${units}`);
      setWorker(null);
      setQty("");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  if (scanning) return <QrScanner fullscreen active onScan={onScan} onClose={() => setScanning(false)} title="Escanea el QR del empleado" />;

  return (
    <div className="flex flex-col min-h-[calc(100dvh-170px)] bg-[#E9E9E9] -mx-4 -my-4 sm:mx-0 sm:my-0 sm:rounded-2xl overflow-hidden" data-testid="quick-harvest">
      {view === "records" ? (
        <Records rows={rows} loading={loadingRows} onBack={() => setView("scan")} onSelect={setEditing} onDeleted={loadRows} />
      ) : (
        <div className="relative flex-1">
          <Row label="Empleado" testid="quick-employee">
            <EmployeeInput worker={worker} workers={workers} onPick={pickWorker} onClear={() => { setWorker(null); setQty(""); }} onCreated={(w) => setWorkers((prev) => [...prev, w])} />
          </Row>
          <Row label="Cantidad" testid="quick-qty-row">
            <div className="flex items-center gap-1.5">
              {FRACTIONS.map(([l, v]) => (
                <button key={l} onClick={() => setQty(String(v))} disabled={!worker} className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors ${Number(qty) === v ? "bg-[#9BC53D] text-white" : "bg-[#E5E7EB] text-[#6B7280]"} disabled:opacity-50`} data-testid={`quick-frac-${l.replace("/", "-")}`}>{l}</button>
              ))}
            </div>
            <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="Cantidad" disabled={!worker} className="w-20 text-right text-[19px] bg-transparent outline-none placeholder:text-[#C4C4C4] disabled:bg-transparent" data-testid="quick-qty-input" />
          </Row>
          <div className="h-6" />
          <Row label="Precio" testid="quick-price"><span className="text-[17px] text-[#111827]">{formatCurrency(price)}</span></Row>
          <div className="h-2" />
          <Row label="Tipo" testid="quick-type"><span className="text-[17px] text-[#111827]">{TIPO[mode] || "Pieza"}</span></Row>

          <button
            onClick={worker ? save : openScanner}
            disabled={saving}
            className="absolute right-5 bottom-5 w-[84px] h-[84px] rounded-full bg-[#9BC53D] hover:bg-[#8AB42F] text-white shadow-[0_6px_16px_rgba(0,0,0,0.25)] flex items-center justify-center transition-[background-color,transform] active:scale-95 disabled:opacity-70"
            data-testid={worker ? "quick-save-button" : "quick-scan-button"}
          >
            {saving ? <Loader2 className="w-8 h-8 animate-spin" /> : worker ? <span className="text-xl font-extrabold">SAVE</span> : <QrCode className="w-11 h-11" />}
          </button>
        </div>
      )}

      <button onClick={() => setView(view === "records" ? "scan" : "records")} className={`shrink-0 bg-white border-t border-[#E5E7EB] py-3 flex flex-col items-center ${view === "records" ? "text-[#1D4ED8]" : "text-[#6B7280]"}`} data-testid="quick-records-tab">
        <Printer className="w-8 h-8" strokeWidth={1.4} />
        <span className="text-sm">Records</span>
      </button>
      {editing && <EditRecord rec={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); loadRows(); }} />}
    </div>
  );
}
