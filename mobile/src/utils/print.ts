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
