import { useEffect, useMemo, useState } from "react";
import { Printer, Loader2, Calendar, Users, Clock, DollarSign, FileText, PrinterIcon, Bluetooth, BluetoothSearching, Receipt, FileCheck, Share2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, formatNumber } from "@/lib/api";
import { thermalPrinter, buildReceiptLines, receiptTicketHtml } from "@/lib/thermalPrinter";

function startOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function receiptHtml(receipt, businessName = "AgriScan") {
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso + "T00:00:00");
      return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
    } catch (_) { return iso; }
  };
  const fmtMoney = (n) => Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

  const attRows = (receipt.attendance || []).map((a) => `
    <tr>
      <td>${fmtDate(a.date)}</td>
      <td>${a.check_in || "—"}</td>
      <td>${a.check_out || "—"}</td>
      <td class="right">${a.hours ? a.hours.toFixed(2) + " h" : "—"}</td>
    </tr>`).join("");

  const harvRows = (receipt.harvests || []).map((h) => `
    <tr>
      <td>${fmtDate(h.date)}</td>
      <td>${h.product_name}</td>
      <td>${h.parcel_name}</td>
      <td class="right">${h.kilos ? h.kilos.toFixed(2) + " Kg" : "—"}</td>
      <td class="right">${h.units ? Math.round(h.units) + " " + h.unit_label : "—"}</td>
      <td class="right">${fmtMoney(h.payment)}</td>
    </tr>`).join("");

  return `
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Recibo — ${receipt.worker_name}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a2210; padding: 32px; max-width: 780px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1D4ED8; padding-bottom: 16px; margin-bottom: 20px; }
  .brand { font-size: 24px; font-weight: 900; color: #1D4ED8; letter-spacing: -0.5px; }
  .brand small { display: block; font-size: 11px; color: #666; font-weight: 600; margin-top: 2px; letter-spacing: 2px; text-transform: uppercase; }
  .doc-title { text-align: right; }
  .doc-title h2 { margin: 0; font-size: 18px; color: #1D4ED8; }
  .doc-title .range { color: #666; font-size: 12px; margin-top: 4px; }
  .worker { background: #F7F5EE; border: 1px solid #E2DDD0; padding: 14px 16px; border-radius: 12px; margin-bottom: 18px; }
  .worker h3 { margin: 0; font-size: 20px; color: #1A2210; }
  .worker .meta { font-size: 12px; color: #556047; margin-top: 2px; font-weight: 600; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .stat { background: #FFF; border: 2px solid #E2DDD0; padding: 10px 12px; border-radius: 10px; }
  .stat .label { font-size: 10px; color: #556047; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .stat .value { font-size: 18px; font-weight: 800; color: #1A2210; margin-top: 4px; font-family: 'Courier New', monospace; }
  .stat.highlight { background: #1D4ED8; color: white; border-color: #0F2912; }
  .stat.highlight .label { color: #d7e5d8; }
  .stat.highlight .value { color: white; }
  .stat.accent { background: #DC2626; color: white; border-color: #c13f00; }
  .stat.accent .label { color: #ffd9b8; }
  .stat.accent .value { color: white; }
  h4 { font-size: 13px; color: #1D4ED8; margin: 18px 0 8px; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid #E2DDD0; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; background: #F0EDE1; color: #1A2210; font-weight: 700; padding: 7px 10px; border-bottom: 2px solid #D4CEB8; }
  td { padding: 6px 10px; border-bottom: 1px solid #EEE; color: #333; }
  td.right, th.right { text-align: right; }
  .total-row { background: #1D4ED8; color: white; }
  .total-row td { color: white; font-weight: 800; padding: 10px; border: none; }
  .signature { margin-top: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .sign-box { border-top: 1px solid #1A2210; padding-top: 6px; text-align: center; font-size: 11px; color: #556047; font-weight: 600; }
  .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #999; }
  @media print { body { padding: 16px; } .no-print { display: none; } }
  @page { margin: 15mm; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #1D4ED8; color: white; padding: 10px 16px; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px; }
</style></head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Imprimir</button>
  <div class="header">
    <div>
      <div class="brand">${businessName}<small>Control de cosechas</small></div>
    </div>
    <div class="doc-title">
      <h2>RECIBO DE PAGO</h2>
      <div class="range">${fmtDate(receipt.date_from)} — ${fmtDate(receipt.date_to)}</div>
      <div class="range">Emitido: ${new Date().toLocaleDateString("es-MX")}</div>
    </div>
  </div>

  <div class="worker">
    <h3>${receipt.worker_name}</h3>
    <div class="meta">${receipt.document_id || "sin ID"}${receipt.role ? " • " + receipt.role : ""}</div>
  </div>

  <div class="stats">
    <div class="stat highlight">
      <div class="label">Total horas</div>
      <div class="value">${(receipt.total_hours || 0).toFixed(2)} h</div>
    </div>
    <div class="stat">
      <div class="label">Días trab.</div>
      <div class="value">${receipt.days_worked || 0}</div>
    </div>
    <div class="stat">
      <div class="label">Kilos</div>
      <div class="value">${(receipt.total_kilos || 0).toFixed(2)}</div>
    </div>
    <div class="stat accent">
      <div class="label">Total a pagar</div>
      <div class="value">${fmtMoney(receipt.total_payment)}</div>
    </div>
  </div>

  ${(receipt.attendance || []).length ? `
    <h4>Asistencia (${(receipt.attendance || []).length} días)</h4>
    <table>
      <thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th class="right">Horas</th></tr></thead>
      <tbody>${attRows}
        <tr class="total-row">
          <td colspan="3">TOTAL HORAS</td>
          <td class="right">${(receipt.total_hours || 0).toFixed(2)} h</td>
        </tr>
      </tbody>
    </table>
  ` : ""}

  ${(receipt.harvests || []).length ? `
    <h4>Cosechas (${(receipt.harvests || []).length} registros)</h4>
    <table>
      <thead><tr><th>Fecha</th><th>Producto</th><th>Parcela</th><th class="right">Kg</th><th class="right">Unid.</th><th class="right">Pago</th></tr></thead>
      <tbody>${harvRows}
        <tr class="total-row">
          <td colspan="5">TOTAL</td>
          <td class="right">${fmtMoney(receipt.total_payment)}</td>
        </tr>
      </tbody>
    </table>
  ` : ""}

  <div class="signature">
    <div class="sign-box">Firma del trabajador</div>
    <div class="sign-box">Firma del supervisor</div>
  </div>

  <div class="footer">
    Documento generado automáticamente por ${businessName} • ${receipt.worker_name} • ${new Date().toLocaleString("es-MX")}
  </div>
</body></html>`;
}

export default function RecibosTab() {
  const [dateFrom, setDateFrom] = useState(startOfMonthISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [workers, setWorkers] = useState([]);
  const [crews, setCrews] = useState([]);
  const [workerId, setWorkerId] = useState("");
  const [crewId, setCrewId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [format, setFormat] = useState("carta"); // "carta" | "ticket"
  const [btConnected, setBtConnected] = useState(false);
  const [btName, setBtName] = useState("");
  const [btPrinting, setBtPrinting] = useState("");
  const [sharing, setSharing] = useState("");

  const fmtMoney = (n) => Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

  const buildReceiptText = (r) => {
    const lines = [];
    lines.push(`🧾 AgriScan — Recibo de pago`);
    lines.push(`${r.worker_name}${r.document_id ? ` (${r.document_id})` : ""}`);
    lines.push(`Periodo: ${r.date_from || "—"} → ${r.date_to || "—"}`);
    lines.push("");
    lines.push(`⏱  Horas: ${(r.total_hours || 0).toFixed(2)}`);
    lines.push(`📅 Días: ${r.days_worked || 0}`);
    if (r.total_kilos) lines.push(`⚖️  Kilos: ${(r.total_kilos || 0).toFixed(2)}`);
    if (r.total_units) lines.push(`📦 Unidades: ${Math.round(r.total_units || 0)}`);
    lines.push(`💵 Total a pagar: ${fmtMoney(r.total_payment)}`);
    if ((r.harvests || []).length) {
      lines.push("");
      lines.push("— Cosechas —");
      r.harvests.slice(0, 15).forEach((h) => {
        const qty = h.kilos ? `${h.kilos.toFixed(2)}Kg` : h.units ? `${Math.round(h.units)}u` : "—";
        lines.push(`• ${h.date} ${h.product_name} · ${qty} · ${fmtMoney(h.payment)}`);
      });
      if (r.harvests.length > 15) lines.push(`…y ${r.harvests.length - 15} más`);
    }
    return lines.join("\n");
  };

  // Fetch the harvests Excel blob with filters and share/download it
  const fetchHarvestsBlob = async (params) => {
    const resp = await api.get("/harvests/export", { params, responseType: "blob" });
    return resp.data;
  };

  const shareOrDownloadBlob = async (blob, filename, text) => {
    const file = new File([blob], filename, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    // 1) Native share with file
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: filename, text, files: [file] });
        return "shared";
      } catch (err) {
        if (err?.name === "AbortError") return "cancelled";
      }
    }
    // 2) Fallback: download the file + copy text summary
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    return "downloaded";
  };

  const shareReceipt = async (r) => {
    setSharing(r.worker_id);
    try {
      const blob = await (await api.get("/receipts/export", {
        params: {
          date_from: r.date_from || dateFrom,
          date_to: r.date_to || dateTo,
          worker_id: r.worker_id,
          tz_offset: -new Date().getTimezoneOffset(),
        },
        responseType: "blob",
      })).data;
      const filename = `recibo_${(r.worker_name || "trabajador").replace(/\s+/g, "_")}_${r.date_to || todayISO()}.xlsx`;
      const text = buildReceiptText(r);
      const result = await shareOrDownloadBlob(blob, filename, text);
      if (result === "shared") toast.success("Recibo compartido");
      else if (result === "downloaded") toast.success("Excel descargado — adjúntalo al mensaje");
    } catch (e) {
      toast.error("No se pudo compartir el recibo");
    } finally {
      setSharing("");
    }
  };

  const shareAll = async () => {
    if (rows.length === 0) {
      toast.error("Sin recibos para compartir");
      return;
    }
    setSharing("__all__");
    try {
      const blob = await (await api.get("/receipts/export", {
        params: {
          date_from: dateFrom,
          date_to: dateTo,
          worker_id: workerId || undefined,
          crew_id: crewId || undefined,
          tz_offset: -new Date().getTimezoneOffset(),
        },
        responseType: "blob",
      })).data;
      const filename = `recibos_${dateFrom || "inicio"}_a_${dateTo || todayISO()}.xlsx`;
      const text = [
        "📋 AgriScan — Recibos del periodo",
        `${dateFrom || "—"} → ${dateTo || "—"}`,
        `${rows.length} trabajador${rows.length !== 1 ? "es" : ""} • Nómina: ${fmtMoney(totals.payment)}`,
      ].join("\n");
      const result = await shareOrDownloadBlob(blob, filename, text);
      if (result === "shared") toast.success("Recibos compartidos");
      else if (result === "downloaded") toast.success("Excel descargado — adjúntalo al mensaje");
    } catch (e) {
      toast.error("No se pudo compartir los recibos");
    } finally {
      setSharing("");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [w, c] = await Promise.all([api.get("/workers"), api.get("/crews")]);
        setWorkers(w.data);
        setCrews(c.data);
      } catch (_) {}
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/receipts", {
        params: {
          date_from: dateFrom,
          date_to: dateTo,
          worker_id: workerId || undefined,
          crew_id: crewId || undefined,
        },
      });
      setRows(data);
      if (data.length === 0) toast.info("Sin actividad en el rango seleccionado");
    } catch (e) {
      toast.error("No se pudieron cargar los recibos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const printReceipt = (receipt) => {
    const html = format === "ticket" ? receiptTicketHtml(receipt) : receiptHtml(receipt);
    const w = format === "ticket" ? 380 : 820;
    const win = window.open("", "_blank", `width=${w},height=900`);
    if (!win) {
      toast.error("Permite ventanas emergentes para imprimir");
      return;
    }
    win.document.write(html);
    win.document.close();
  };

  const printAll = () => {
    if (rows.length === 0) {
      toast.error("Nada para imprimir");
      return;
    }
    if (format === "ticket") {
      // One ticket per worker, consecutive
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Tickets</title>
        <style>@page{size:80mm auto;margin:4mm} .page{page-break-after:always}</style></head><body>
        ${rows.map((r) => `<div class="page">${receiptTicketHtml(r).replace(/<!doctype[\s\S]*?<body>/, "").replace(/<\/body><\/html>$/, "")}</div>`).join("")}
        </body></html>`;
      const win = window.open("", "_blank", "width=400,height=900");
      if (!win) { toast.error("Permite ventanas emergentes para imprimir"); return; }
      win.document.write(html);
      win.document.close();
      return;
    }
    const html = `
      <!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibos en lote</title></head>
      <body>${rows.map((r) => receiptHtml(r).replace(/<!doctype[\s\S]*?<body>/, "").replace(/<\/body><\/html>$/, "") + '<div style="page-break-after: always;"></div>').join("")}</body></html>
    `;
    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) { toast.error("Permite ventanas emergentes para imprimir"); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { try { win.print(); } catch (_) {} }, 400);
  };

  const connectBluetooth = async () => {
    try {
      const name = await thermalPrinter.connect();
      setBtConnected(true);
      setBtName(name);
      toast.success(`Impresora conectada: ${name}`);
    } catch (e) {
      toast.error(e?.message || "No se pudo conectar la impresora");
    }
  };

  const disconnectBluetooth = async () => {
    await thermalPrinter.disconnect();
    setBtConnected(false);
    setBtName("");
    toast.info("Impresora desconectada");
  };

  const printBluetooth = async (receipt) => {
    if (!thermalPrinter.isConnected()) {
      toast.error("Primero conecta la impresora Bluetooth");
      return;
    }
    setBtPrinting(receipt.worker_id);
    try {
      const parts = buildReceiptLines(receipt);
      await thermalPrinter.print(parts);
      toast.success(`Ticket enviado: ${receipt.worker_name}`);
    } catch (e) {
      toast.error("Error imprimiendo: " + (e?.message || ""));
    } finally {
      setBtPrinting("");
    }
  };

  const printAllBluetooth = async () => {
    if (!thermalPrinter.isConnected()) {
      toast.error("Primero conecta la impresora Bluetooth");
      return;
    }
    for (const r of rows) {
      setBtPrinting(r.worker_id);
      try {
        await thermalPrinter.print(buildReceiptLines(r));
      } catch (e) {
        toast.error(`Error: ${r.worker_name}`);
      }
      await new Promise((res) => setTimeout(res, 600));
    }
    setBtPrinting("");
    toast.success(`${rows.length} tickets enviados`);
  };

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        hours: a.hours + (r.total_hours || 0),
        payment: a.payment + (r.total_payment || 0),
        kilos: a.kilos + (r.total_kilos || 0),
      }),
      { hours: 0, payment: 0, kilos: 0 }
    );
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="field-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[#1D4ED8]" />
          <h3 className="text-base font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
            Período de pago
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="field-input !h-12 !text-base" data-testid="recibos-date-from" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="field-input !h-12 !text-base" data-testid="recibos-date-to" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Cuadrilla</label>
            <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className="field-input !h-12 !text-base" data-testid="recibos-crew">
              <option value="">Todas</option>
              {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Trabajador</label>
            <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="field-input !h-12 !text-base" data-testid="recibos-worker">
              <option value="">Todos</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>

        {/* Format toggle + Bluetooth */}
        <div className="pt-3 border-t border-[#E2DDD0] space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">Formato de impresión</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormat("carta")}
                data-testid="format-carta"
                className={`h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 border-2 ${
                  format === "carta" ? "bg-[#1D4ED8] text-white border-[#1D4ED8]" : "bg-white text-[#556047] border-[#E2DDD0] hover:bg-[#F7F5EE]"
                }`}
              >
                <FileCheck className="w-4 h-4" /> Carta / A4
              </button>
              <button
                onClick={() => setFormat("ticket")}
                data-testid="format-ticket"
                className={`h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 border-2 ${
                  format === "ticket" ? "bg-[#1D4ED8] text-white border-[#1D4ED8]" : "bg-white text-[#556047] border-[#E2DDD0] hover:bg-[#F7F5EE]"
                }`}
              >
                <Receipt className="w-4 h-4" /> Ticket 80mm
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 bg-[#F0EDE1] rounded-xl p-3 border border-[#D4CEB8]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-bold text-[#1A2210]">
                <Bluetooth className={`w-4 h-4 ${btConnected ? "text-[#1D4ED8]" : "text-[#889078]"}`} />
                Impresora Bluetooth
              </div>
              <div className="text-xs text-[#556047] font-semibold truncate">
                {btConnected ? `Conectada: ${btName}` : "No conectada • Ticketera térmica ESC/POS"}
              </div>
            </div>
            {btConnected ? (
              <button onClick={disconnectBluetooth} className="h-10 px-3 bg-white border-2 border-red-200 text-red-700 hover:bg-red-50 font-bold rounded-xl text-sm" data-testid="bt-disconnect">
                Desconectar
              </button>
            ) : (
              <button onClick={connectBluetooth} className="h-10 px-3 bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-bold rounded-xl text-sm flex items-center gap-1.5" data-testid="bt-connect">
                <BluetoothSearching className="w-4 h-4" /> Conectar
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={load} disabled={loading} className="field-btn-secondary flex-1" data-testid="recibos-load-button">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><FileText className="w-5 h-5" /> Generar recibos</>}
          </button>
          <button onClick={printAll} disabled={rows.length === 0} className="field-btn-accent flex-1 disabled:opacity-60" data-testid="recibos-print-all">
            <PrinterIcon className="w-5 h-5" /> Imprimir todos ({rows.length})
          </button>
          {btConnected && rows.length > 0 && (
            <button onClick={printAllBluetooth} disabled={!!btPrinting} className="h-14 px-5 bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60" data-testid="bt-print-all">
              {btPrinting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Bluetooth className="w-5 h-5" /> Imprimir en ticketera</>}
            </button>
          )}
        </div>
        <button
          onClick={shareAll}
          disabled={sharing === "__all__" || rows.length === 0}
          className="w-full h-12 rounded-xl bg-[#1E2746] hover:bg-[#172038] active:scale-[0.99] text-white font-extrabold flex items-center justify-center gap-2 shadow-md disabled:opacity-60 border-2 border-[#111A2E]"
          data-testid="recibos-share-all"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          {sharing === "__all__" ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Share2 className="w-5 h-5" /> Compartir todos ({rows.length})</>}
        </button>
        <p className="text-[11px] text-[#889078] font-semibold text-center -mt-1">
          Envía por WhatsApp, Mensajes, Gmail, Correo, Telegram…
        </p>
      </div>

      {/* Totals */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-[#1D4ED8] text-white p-4 border-2 border-[#1E3A8A] shadow-sm" data-testid="recibos-total-hours">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-90 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Horas</div>
            <div className="font-mono-stat text-xl sm:text-2xl mt-1">{formatNumber(totals.hours, 2)}</div>
          </div>
          <div className="rounded-2xl bg-white border-2 border-[#E2DDD0] text-[#1A2210] p-4 shadow-sm" data-testid="recibos-total-workers">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#556047] flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Trabajadores</div>
            <div className="font-mono-stat text-xl sm:text-2xl mt-1">{rows.length}</div>
          </div>
          <div className="rounded-2xl bg-[#DC2626] text-white p-4 border-2 border-[#B91C1C] shadow-sm" data-testid="recibos-total-payment">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-90 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> Nómina</div>
            <div className="font-mono-stat text-xl sm:text-2xl mt-1">{formatCurrency(totals.payment)}</div>
          </div>
        </div>
      )}

      {/* Receipt cards */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-[#1D4ED8]"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="field-card p-8 text-center">
          <FileText className="w-10 h-10 mx-auto text-[#889078] mb-2" />
          <p className="text-sm text-[#556047] font-semibold">Sin actividad en el período seleccionado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.worker_id} className="field-card p-4 sm:p-5" data-testid={`recibo-card-${r.worker_id}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-extrabold text-lg text-[#1A2210] truncate" style={{ fontFamily: "Outfit, sans-serif" }}>
                    {r.worker_name}
                  </h3>
                  <div className="text-xs text-[#556047] font-semibold">
                    {r.document_id || "sin ID"} {r.role ? "• " + r.role : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                <button
                  onClick={() => printReceipt(r)}
                  className="h-10 px-4 bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm"
                  data-testid={`recibo-print-${r.worker_id}`}
                >
                  <Printer className="w-4 h-4" /> {format === "ticket" ? "Ticket" : "Imprimir"}
                </button>
                <button
                  onClick={() => shareReceipt(r)}
                  disabled={sharing === r.worker_id}
                  className="h-10 px-3 bg-[#1E2746] hover:bg-[#172038] text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                  data-testid={`recibo-share-${r.worker_id}`}
                  title="Compartir por WhatsApp, Gmail, Mensajes…"
                >
                  {sharing === r.worker_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                </button>
                {btConnected && (
                  <button
                    onClick={() => printBluetooth(r)}
                    disabled={btPrinting === r.worker_id}
                    className="h-10 px-3 bg-white border-2 border-[#1D4ED8] text-[#1D4ED8] hover:bg-blue-50 font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-60"
                    data-testid={`bt-print-${r.worker_id}`}
                    title="Imprimir en ticketera Bluetooth"
                  >
                    {btPrinting === r.worker_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
                  </button>
                )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="bg-[#F7F5EE] rounded-xl p-2.5 border border-[#E2DDD0]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#556047]">Horas</div>
                  <div className="font-mono-stat text-base text-[#1A2210] mt-0.5">{formatNumber(r.total_hours, 2)}</div>
                </div>
                <div className="bg-[#F7F5EE] rounded-xl p-2.5 border border-[#E2DDD0]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#556047]">Días</div>
                  <div className="font-mono-stat text-base text-[#1A2210] mt-0.5">{r.days_worked}</div>
                </div>
                <div className="bg-[#F7F5EE] rounded-xl p-2.5 border border-[#E2DDD0]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#556047]">Kg + Unid.</div>
                  <div className="font-mono-stat text-base text-[#1A2210] mt-0.5">
                    {formatNumber(r.total_kilos, 0)}+{formatNumber(r.total_units, 0)}
                  </div>
                </div>
                <div className="bg-[#DC2626] rounded-xl p-2.5 border border-[#B91C1C] text-white">
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-90">Pago</div>
                  <div className="font-mono-stat text-base mt-0.5">{formatCurrency(r.total_payment)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
