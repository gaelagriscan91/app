import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { formatCurrency, unitOf, fmtStamp } from "@/src/utils/format";

type Harvest = {
  id: string; worker_id: string; worker_name?: string; date?: string;
  units?: number; price_per_unit?: number; payment?: number;
  created_at?: string; unit_type?: string; price_mode?: string;
  mayordomo?: string; grower?: string;
};

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

export async function printWorkerTicket(rec: Harvest, rows: Harvest[]) {
  const mine = rows.filter((r) => r.worker_id === rec.worker_id).slice().reverse();
  const total = mine.reduce((s, r) => s + Number(r.payment || 0), 0);
  const byUnit: Record<string, number> = {};
  mine.forEach((r) => { byUnit[unitOf(r)] = (byUnit[unitOf(r)] || 0) + Number(r.units || 0); });
  const totalQty = Object.entries(byUnit).map(([u, q]) => `${Math.round(q * 100) / 100} ${u}`).join(" · ");
  const body = mine
    .map((r) => `<div class="when">${esc(fmtStamp(r))}</div><div class="r"><span>${esc(`${r.units} ${unitOf(r)} x ${formatCurrency(r.price_per_unit)}`)}</span><span>${esc(formatCurrency(r.payment))}</span></div>`)
    .join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font-family:'Courier New',monospace;font-size:13px;width:280px;margin:0 auto;padding:8px}
  h1{text-align:center;font-size:20px;margin:4px 0}.c{text-align:center}.r{display:flex;justify-content:space-between;margin-bottom:6px}
  .when{font-size:11px;color:#333}hr{border:none;border-top:1px dashed #000;margin:8px 0}.big{font-size:26px;font-weight:bold;text-align:center}b{font-size:15px}</style></head>
  <body><h1>AgriScan</h1><div class="c">${esc(rec.date)}</div><hr><b>${esc(rec.worker_name)}</b>
  ${rec.mayordomo ? `<div>Mayordomo: ${esc(rec.mayordomo)}</div>` : ""}${rec.grower ? `<div>Grower: ${esc(rec.grower)}</div>` : ""}
  <hr>${body}<hr><div class="r"><span>Total:</span><span>${esc(totalQty)}</span></div>
  <div class="c"><b>GANÓ</b></div><div class="big">${esc(formatCurrency(total))}</div></body></html>`;
  await Print.printAsync({ html });
}

export async function shareReceiptSheet(receipt: any) {
  const rows: any[] = receipt.rows || [];
  const allH = rows.flatMap((r) => r.harvests || []);
  const pick = (arr: any[]) => { const u = [...new Set(arr.filter((x) => x && x !== "—"))]; return u.length === 0 ? "" : u.length === 1 ? String(u[0]) : "Varios"; };
  const mayordomo = pick(allH.map((h: any) => h.mayordomo)) || receipt.saved_by_name || "";
  const head = {
    ranch: pick(allH.map((h: any) => h.parcel_name)),
    block: pick(allH.map((h: any) => h.block)),
    trabajo: pick(allH.map((h: any) => h.product_name)),
    variedad: pick(allH.map((h: any) => h.variety)),
    mayordomo,
    grower: pick(allH.map((h: any) => h.grower)),
  };
  const timeAmPm = (iso?: string) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).replace("AM", "a.m.").replace("PM", "p.m."); } catch { return ""; }
  };
  const mdy = (d?: string) => { if (!d) return ""; try { return new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US"); } catch { return d; } };
  const hoursHM = (x?: number) => { const v = Number(x || 0); if (v <= 0) return "0h"; const h = Math.floor(v); const m = Math.round((v - h) * 60); return m > 0 ? `${h}h ${m}min` : `${h}h`; };

  const tr = rows.map((r) => {
    const h0 = (r.harvests || [])[0] || {};
    const prices = [...new Set((r.harvests || []).map((h: any) => h.price_per_unit).filter((x: any) => x > 0))];
    const price = prices.length === 0 ? "" : prices.length === 1 ? formatCurrency(prices[0] as number) : "Varios";
    const date = (r.attendance || [])[0]?.date || h0.date || receipt.date_from;
    return `<tr>
      <td class="c">${esc(r.document_id || "")}</td>
      <td class="nm">${esc(r.worker_name || "")}</td>
      <td>${esc(timeAmPm(r.min_check_in_iso))}</td>
      <td>${esc(mdy(date))}</td>
      <td>${esc(r.still_working ? "" : timeAmPm(r.max_check_out_iso))}</td>
      <td class="r">${esc(hoursHM(r.total_hours))}</td>
      <td class="r">${Math.round(r.total_units || 0)}</td>
      <td class="r">${esc(price)}</td>
      <td class="r b">${esc(formatCurrency(r.total_payment))}</td>
    </tr>`;
  }).join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <style>
    *{box-sizing:border-box}
    body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:14px;color:#111}
    table{border-collapse:collapse;width:100%}
    .hdr td{border:1px solid #000;padding:5px 7px;font-size:12px}
    .hdr .lbl{font-weight:bold;width:70px;text-align:center}
    .hdr .val{text-align:center;color:#222}
    .grid{margin-bottom:10px}
    .data th{background:#c9c9c9;border:1px solid #000;padding:7px 6px;font-size:11px;text-align:left;font-weight:bold}
    .data td{border:1px solid #9a9a9a;padding:5px 6px;font-size:11px}
    .data .c{text-align:center}
    .data .r{text-align:right}
    .data .nm{font-weight:600}
    .data .b{font-weight:bold}
    .data tr:nth-child(even) td{background:#fafafa}
    .tot td{background:#e3e3e3;border:1px solid #000;font-weight:bold;font-size:11px;padding:6px}
    .tot .r{text-align:right}
  </style></head>
  <body>
    <table class="grid">
      <tr class="hdr"><td class="lbl">RANCH</td><td class="val">${esc(head.ranch)}</td><td class="lbl">BLOCK#</td><td class="val">${esc(head.block)}</td><td class="lbl">Trabajo</td><td class="val">${esc(head.trabajo)}</td></tr>
      <tr class="hdr"><td class="lbl">Variedad</td><td class="val">${esc(head.variedad)}</td><td class="lbl">Mayordomo</td><td class="val">${esc(head.mayordomo)}</td><td class="lbl">Grower</td><td class="val">${esc(head.grower)}</td></tr>
    </table>
    <table class="data">
      <thead><tr>
        <th>SS#</th><th>EMPLOYEE NAME</th><th>Hora entrada</th><th>Fecha</th><th>Hora Salida</th><th>Total Horas</th><th>Total piezas</th><th>Precio</th><th>$</th>
      </tr></thead>
      <tbody>${tr}
        <tr class="tot"><td colspan="5" class="r">TOTAL</td><td class="r">${esc(hoursHM(receipt.total_hours))}</td><td class="r">${Math.round(receipt.total_units || 0)}</td><td></td><td class="r">${esc(formatCurrency(receipt.total_payment))}</td></tr>
      </tbody>
    </table>
  </body></html>`;

  const available = await Sharing.isAvailableAsync();
  if (!available) { await Print.printAsync({ html }); return; }
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { dialogTitle: "Recibo guardado", mimeType: "application/pdf", UTI: "com.adobe.pdf" });
}

export async function shareTextSummary(title: string, text: string) {
  // Render a printable summary and let the OS share sheet handle it.
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    await Print.printAsync({ html: `<html><body style="font-family:sans-serif;white-space:pre-wrap;padding:16px;font-size:14px">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string))}</body></html>` });
    return;
  }
  const { uri } = await Print.printToFileAsync({
    html: `<html><body style="font-family:sans-serif;white-space:pre-wrap;padding:20px;font-size:14px">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string))}</body></html>`,
  });
  await Sharing.shareAsync(uri, { dialogTitle: title, mimeType: "application/pdf" });
}
