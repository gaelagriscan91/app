import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, UserPlus, X, Save, QrCode, Printer, RefreshCw, PrinterIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import api from "@/lib/api";

const EMPTY = { name: "", document_id: "", phone: "", role: "Cosechador", active: true };

export default function WorkersTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [qrWorker, setQrWorker] = useState(null);
  const hiddenRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/workers");
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startNew = () => { setForm(EMPTY); setEditing("new"); };
  const startEdit = (r) => {
    setForm({ name: r.name, document_id: r.document_id || "", phone: r.phone || "", role: r.role || "Cosechador", active: r.active !== false });
    setEditing(r.id);
  };
  const cancel = () => { setEditing(null); setForm(EMPTY); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      if (editing === "new") {
        await api.post("/workers", form);
        toast.success("Trabajador agregado — QR generado");
      } else {
        await api.put(`/workers/${editing}`, form);
        toast.success("Trabajador actualizado");
      }
      await load();
      cancel();
    } catch (e) {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("¿Eliminar este trabajador?")) return;
    try {
      await api.delete(`/workers/${id}`);
      toast.success("Eliminado");
      load();
    } catch (e) { toast.error("No se pudo eliminar"); }
  };

  const regenQr = async (id) => {
    if (!window.confirm("¿Generar un nuevo QR? El anterior quedará invalidado.")) return;
    try {
      const { data } = await api.post(`/workers/${id}/regenerate-qr`);
      toast.success("Nuevo QR generado");
      setQrWorker(data);
      load();
    } catch (e) { toast.error("No se pudo regenerar"); }
  };

  const printQr = () => {
    if (!qrWorker) return;
    const svg = document.querySelector("#qr-print-svg");
    const svgData = svg ? new XMLSerializer().serializeToString(svg) : "";
    const win = window.open("", "_blank", "width=400,height=600");
    win.document.write(`
      <html><head><title>QR ${qrWorker.name}</title>
      <style>
        body { font-family: Arial, sans-serif; text-align:center; padding:24px; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        .code { font-family: monospace; font-size: 14px; color: #555; margin-top: 8px; }
        .doc { color: #666; font-size: 14px; }
        .qr { margin: 20px auto; }
      </style></head>
      <body>
        <h1>${qrWorker.name}</h1>
        <div class="doc">${qrWorker.document_id || ""} ${qrWorker.role ? "• " + qrWorker.role : ""}</div>
        <div class="qr">${svgData}</div>
        <div class="code">${qrWorker.qr_code}</div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); }</script>
      </body></html>
    `);
    win.document.close();
  };

  const printAllQr = () => {
    const withQr = rows.filter((r) => r.qr_code);
    if (withQr.length === 0) { toast.error("No hay QRs para imprimir"); return; }
    // Grab the hidden svgs
    const svgs = {};
    withQr.forEach((w) => {
      const el = hiddenRef.current?.querySelector(`#qr-hidden-${w.id}`);
      if (el) svgs[w.id] = new XMLSerializer().serializeToString(el);
    });
    const cards = withQr.map((w) => `
      <div class="card">
        <h3>${w.name}</h3>
        <div class="meta">${w.document_id || "sin ID"}${w.role ? " • " + w.role : ""}</div>
        <div class="qr">${svgs[w.id] || ""}</div>
        <div class="code">${w.qr_code}</div>
      </div>
    `).join("");
    const html = `
      <!doctype html><html lang="es"><head><meta charset="utf-8"><title>Credenciales QR</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; margin: 0; padding: 12mm; background: #fff; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10mm; }
        .card { border: 2px solid #1D4ED8; border-radius: 8px; padding: 10px; text-align: center; break-inside: avoid; page-break-inside: avoid; }
        .card h3 { margin: 0 0 2px; font-size: 16px; color: #1A2210; }
        .card .meta { font-size: 11px; color: #556047; margin-bottom: 8px; }
        .card .qr { display: flex; justify-content: center; margin: 4px 0; }
        .card .qr svg { width: 160px; height: 160px; }
        .card .code { font-family: monospace; font-size: 11px; color: #555; margin-top: 4px; }
        .header { text-align: center; margin-bottom: 10mm; }
        .header h1 { color: #1D4ED8; margin: 0; font-size: 22px; }
        .header p { color: #556047; font-size: 12px; margin: 2px 0; }
        @page { margin: 10mm; }
        @media print { .no-print { display: none; } }
        .print-btn { position: fixed; top: 12px; right: 12px; background: #1D4ED8; color: white; padding: 8px 14px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
      </style></head><body>
        <button class="print-btn no-print" onclick="window.print()">🖨 Imprimir</button>
        <div class="header">
          <h1>AgriScan — Credenciales de Trabajador</h1>
          <p>Escanea el QR en el módulo de Asistencia o Cosechar para registrar actividad</p>
        </div>
        <div class="grid">${cards}</div>
      </body></html>`;
    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) { toast.error("Permite ventanas emergentes para imprimir"); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { try { win.focus(); } catch (_) {} }, 400);
  };

  return (
    <div className="space-y-4">
      {/* Hidden QRs for batch printing */}
      <div ref={hiddenRef} className="hidden">
        {rows.filter((r) => r.qr_code).map((r) => (
          <QRCodeSVG key={r.id} id={`qr-hidden-${r.id}`} value={r.qr_code} size={160} level="H" />
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={startNew} className="field-btn-primary flex-1" data-testid="add-worker-button">
          <UserPlus className="w-5 h-5" /> Agregar trabajador
        </button>
        <button
          onClick={printAllQr}
          disabled={rows.length === 0}
          className="h-14 px-5 bg-white border-2 border-[#1D4ED8] text-[#1D4ED8] hover:bg-blue-50 font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
          data-testid="print-all-qr-button"
        >
          <PrinterIcon className="w-5 h-5" /> Imprimir todos los QR
        </button>
      </div>

      {editing && (
        <div className="field-card p-4 space-y-3" data-testid="worker-form">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#1A2210]">{editing === "new" ? "Nuevo trabajador" : "Editar trabajador"}</h3>
            <button onClick={cancel} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1]"><X className="w-4 h-4 mx-auto" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="field-input !h-12 !text-base" placeholder="Nombre completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="worker-name-input" />
            <input className="field-input !h-12 !text-base" placeholder="Documento / ID" value={form.document_id} onChange={(e) => setForm({ ...form, document_id: e.target.value })} data-testid="worker-document-input" />
            <input className="field-input !h-12 !text-base" placeholder="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="worker-phone-input" />
            <select className="field-input !h-12 !text-base" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="worker-role-input">
              <option>Cosechador</option>
              <option>Supervisor</option>
              <option>Chofer</option>
              <option>Empacador</option>
              <option>Otro</option>
            </select>
          </div>
          <label className="flex items-center gap-2 font-semibold text-[#1A2210]">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-5 h-5 accent-[#1D4ED8]" />
            Activo
          </label>
          <button onClick={save} disabled={saving} className="field-btn-primary disabled:opacity-60" data-testid="worker-save-button">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Guardar</>}
          </button>
        </div>
      )}

      <div className="field-card divide-y divide-[#E2DDD0]">
        {loading ? (
          <div className="p-6 flex justify-center text-[#1D4ED8]"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-[#556047] font-semibold">Sin trabajadores</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="p-3 flex items-center justify-between gap-3" data-testid={`worker-row-${r.id}`}>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[#1A2210] truncate">{r.name}</div>
                <div className="text-xs text-[#556047] font-semibold truncate">
                  {r.role || "—"} • {r.document_id || "sin ID"} • {r.phone || "sin tel."}
                </div>
                {r.qr_code && (
                  <div className="text-[10px] font-mono text-[#889078] truncate">{r.qr_code}</div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {r.active === false ? (
                  <span className="text-[10px] bg-red-50 text-red-700 border border-red-200 font-bold px-2 py-0.5 rounded-full">Inactivo</span>
                ) : (
                  <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-bold px-2 py-0.5 rounded-full">Activo</span>
                )}
                <button onClick={() => setQrWorker(r)} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1] text-[#1D4ED8]" data-testid={`worker-qr-${r.id}`} title="Ver QR"><QrCode className="w-4 h-4 mx-auto" /></button>
                <button onClick={() => startEdit(r)} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1] text-[#1D4ED8]" data-testid={`worker-edit-${r.id}`}><Pencil className="w-4 h-4 mx-auto" /></button>
                <button onClick={() => remove(r.id)} className="w-9 h-9 rounded-lg hover:bg-red-50 text-red-600" data-testid={`worker-delete-${r.id}`}><Trash2 className="w-4 h-4 mx-auto" /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* QR Modal */}
      {qrWorker && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setQrWorker(null)} data-testid="qr-modal">
          <div
            className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
                  {qrWorker.name}
                </h3>
                <div className="text-xs text-[#556047] font-semibold">
                  {qrWorker.document_id || "sin ID"} {qrWorker.role ? "• " + qrWorker.role : ""}
                </div>
              </div>
              <button onClick={() => setQrWorker(null)} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1]">
                <X className="w-4 h-4 mx-auto" />
              </button>
            </div>
            <div className="bg-[#F7F5EE] rounded-2xl p-5 flex items-center justify-center my-3">
              {qrWorker.qr_code ? (
                <QRCodeSVG id="qr-print-svg" value={qrWorker.qr_code} size={220} level="H" includeMargin={false} fgColor="#1A2210" />
              ) : (
                <p className="text-sm text-[#556047]">Sin QR asignado</p>
              )}
            </div>
            <div className="text-center text-xs font-mono text-[#556047] mb-4">{qrWorker.qr_code}</div>
            <div className="flex gap-2">
              <button
                onClick={printQr}
                disabled={!qrWorker.qr_code}
                className="flex-1 h-11 bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-1.5"
                data-testid="qr-print-button"
              >
                <Printer className="w-4 h-4" /> Imprimir
              </button>
              <button
                onClick={() => regenQr(qrWorker.id)}
                className="h-11 px-4 bg-white border-2 border-[#1D4ED8] text-[#1D4ED8] hover:bg-blue-50 font-bold rounded-xl flex items-center gap-1.5"
                data-testid="qr-regen-button"
              >
                <RefreshCw className="w-4 h-4" /> Regenerar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
