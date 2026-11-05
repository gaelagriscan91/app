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
  const head = {
    grower: pick(allH.map((h: any) => h.grower)),
    block: pick(allH.map((h: any) => h.block)),
    rancho: pick(allH.map((h: any) => h.parcel_name)),
    descripcion: pick(allH.map((h: any) => h.product_name)),
    variety: pick(allH.map((h: any) => h.variety)),
    mayordomo: pick(allH.map((h: any) => h.mayordomo)) || receipt.saved_by_name || "",
    locacion: pick(allH.map((h: any) => h.location || h.parcel_location)),
  };
  const timeHM = (iso?: string) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?(AM|PM)/i, ""); } catch { return ""; }
  };
  const mdyShort = (d?: string) => {
    if (!d) return "";
    try { const D = new Date(d.length === 10 ? d + "T12:00:00" : d); return `${D.getMonth() + 1}/${D.getDate()}/${String(D.getFullYear()).slice(-2)}`; } catch { return d; }
  };
  const hoursHM = (x?: number) => { const v = Number(x || 0); if (v <= 0) return "0"; const h = Math.floor(v); const m = Math.round((v - h) * 60); return m > 0 ? `${h}h ${m}min` : `${h}h`; };
  const adjHours = (x?: number) => { const v = Number(x || 0); return v >= 4 ? Math.max(0, v - 0.5) : v; };

  const checkIns = rows.map((r) => r.min_check_in_iso).filter(Boolean).map((x: string) => new Date(x).getTime());
  const baseTs = checkIns.length ? Math.min(...checkIns) : null;
  const tsTime = (ts: number) => timeHM(new Date(ts).toISOString());
  const basisHours = rows.reduce((mx, r) => Math.max(mx, Number(r.total_hours || 0)), 0);
  const show1 = basisHours >= 2, showLunch = basisHours >= 4, show2 = basisHours >= 6;
  const brk = baseTs != null ? {
    b1: show1 ? tsTime(baseTs + 120 * 60000) : "", b1e: show1 ? tsTime(baseTs + 130 * 60000) : "",
    lunch: showLunch ? tsTime(baseTs + 240 * 60000) : "", lunchE: showLunch ? tsTime(baseTs + 270 * 60000) : "",
    b2: show2 ? tsTime(baseTs + 360 * 60000) : "", b2e: show2 ? tsTime(baseTs + 370 * 60000) : "",
  } : { b1: "", b1e: "", lunch: "", lunchE: "", b2: "", b2e: "" };
  const totalAdjHours = rows.reduce((sum, r) => sum + adjHours(r.total_hours), 0);

  const tr = rows.map((r) => {
    const h0 = (r.harvests || [])[0] || {};
    const prices = [...new Set((r.harvests || []).map((h: any) => h.price_per_unit).filter((x: any) => x > 0))];
    const price = prices.length === 0 ? "" : prices.length === 1 ? formatCurrency(prices[0] as number) : "Varios";
    const date = (r.attendance || [])[0]?.date || h0.date || receipt.date_from;
    return `<tr>
      <td class="c">${esc(r.document_id || "")}</td>
      <td class="nm">${esc(r.worker_name || "")}</td>
      <td class="r">${esc(timeHM(r.min_check_in_iso))}</td>
      <td class="c">${esc(mdyShort(date))}</td>
      <td class="r">${esc(r.still_working ? "" : timeHM(r.max_check_out_iso))}</td>
      <td class="r">${esc(hoursHM(adjHours(r.total_hours)))}</td>
      <td class="r">${esc(price)}</td>
      <td class="r b">${esc(formatCurrency(r.total_payment))}</td>
    </tr>`;
  }).join("");

  const fld = (label: string, value: string, _w = 150) => `<span class="fl"><b>${label}</b><span class="uv">${esc(value)}</span></span>`;

  // Fit the report on one page (612x792): shrink the row height by row count down to a readable minimum.
  // Beyond that, rows never split across a page break and the table header repeats on every page.
  const PAGE_W = 612, PAGE_H = 792;
  const FIXED_H = 230; // page padding + title + header fields + table margin, plus a safety margin for device differences
  const rowH = Math.max(16, Math.min(33, Math.floor((PAGE_H - FIXED_H) / (rows.length + 2)))); // + table header + total row
  const fs = Math.max(8, Math.min(11.5, Math.round(rowH * 0.42 * 10) / 10));
  const pad = Math.max(1, Math.round(((rowH - 1 - fs * 1.25) / 2) * 10) / 10);

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <style>
    *{box-sizing:border-box}
    body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:18px 20px;color:#111}
    h1{text-align:center;font-size:17px;font-weight:800;letter-spacing:.5px;margin:0 0 16px}
    .hwrap{display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:18px;margin-bottom:16px}
    .hcol{display:flex;flex-direction:column;gap:7px;min-width:0}
    .hcol.c3{flex:1}
    .fl{display:flex;align-items:baseline;font-size:12.5px;white-space:nowrap;min-width:0}
    .fl b{font-weight:700;margin-right:4px;flex-shrink:0}
    .uv{display:block;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid #000;padding:0 6px;min-height:15px}
    .brk{display:flex;gap:10px}
    .brk .fl{flex:1}
    table.data{border-collapse:collapse;width:100%;margin-top:4px}
    .data th{border:1px solid #000;padding:${pad}px 8px;font-size:${fs}px;text-align:left;font-weight:700}
    .data td{border:1px solid #000;padding:${pad}px 8px;font-size:${fs}px}
    .data tr{page-break-inside:avoid}
    .data thead{display:table-header-group}
    .data .c{text-align:center}
    .data .r{text-align:right}
    .data .nm{font-weight:600}
    .data .b{font-weight:700}
    .data .tot td{font-weight:800;background:#f0f0f0}
  </style></head>
  <body>
    <h1>DAILY LABORT REPORT</h1>
    <div class="hwrap">
      <div class="hcol">
        ${fld("Fecha:", mdyShort(receipt.date_from), 110)}
        ${fld("Block:", head.block, 120)}
        ${fld("Rancho:", head.rancho, 120)}
        ${fld("Locacion:", head.locacion, 110)}
      </div>
      <div class="hcol">
        ${fld("Grower:", head.grower, 150)}
        ${fld("Mayordomo", head.mayordomo, 150)}
        ${fld("Descripción:", head.descripcion, 140)}
        ${fld("Variety :", head.variety, 150)}
      </div>
      <div class="hcol c3">
        <div class="brk">${fld("1Break:", brk.b1, 70)}${fld("termina:", brk.b1e, 70)}</div>
        <div class="brk">${fld("Lunch :", brk.lunch, 70)}${fld("termina:", brk.lunchE, 70)}</div>
        <div class="brk">${fld("2 Break:", brk.b2, 70)}${fld("termina:", brk.b2e, 70)}</div>
      </div>
    </div>
    <table class="data">
      <thead><tr>
        <th>SS#  ID#</th><th>Nombre Empleados</th><th>Hora Entrada</th><th>Fecha</th><th>Hora Salida</th><th>Total Horas</th><th>Precio</th><th>$</th>
      </tr></thead>
      <tbody>${tr}
        <tr class="tot"><td colspan="5" class="r">TOTAL</td><td class="r">${esc(hoursHM(totalAdjHours))}</td><td></td><td class="r">${esc(formatCurrency(receipt.total_payment))}</td></tr>
      </tbody>
    </table>
  </body></html>`;

  const available = await Sharing.isAvailableAsync();
  if (!available) { await Print.printAsync({ html }); return; }
  const { uri } = await Print.printToFileAsync({ html, width: PAGE_W, height: PAGE_H });
  await Sharing.shareAsync(uri, { dialogTitle: "Daily Labort Report", mimeType: "application/pdf", UTI: "com.adobe.pdf" });
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
