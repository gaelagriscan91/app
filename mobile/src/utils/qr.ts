import QRCode from "qrcode";
import * as Print from "expo-print";

export async function qrSvg(value: string, size = 160): Promise<string> {
  return QRCode.toString(value || " ", { type: "svg", margin: 1, width: size });
}

function esc(s: any) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

/** Print a sheet with every worker's QR badge (name + code). */
export async function printAllQR(workers: { name: string; qr_code?: string }[]) {
  const cells = await Promise.all(
    workers
      .filter((w) => w.qr_code)
      .map(async (w) => {
        const svg = await QRCode.toString(w.qr_code as string, { type: "svg", margin: 1, width: 150 });
        return `<div class="cell"><div class="qr">${svg}</div><div class="nm">${esc(w.name)}</div><div class="cd">${esc(w.qr_code)}</div></div>`;
      }),
  );
  const html = `<!doctype html><html><head><meta charset="utf-8">
  <style>body{font-family:sans-serif;margin:0;padding:12px}
  .grid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
  .cell{width:170px;border:1px solid #ddd;border-radius:10px;padding:10px;text-align:center;page-break-inside:avoid}
  .qr svg{width:150px;height:150px}.nm{font-weight:bold;font-size:14px;margin-top:6px}.cd{font-family:monospace;font-size:11px;color:#555}
  h1{text-align:center;font-size:18px}</style></head>
  <body><h1>AgriScan — Códigos QR de empleados</h1><div class="grid">${cells.join("")}</div></body></html>`;
  await Print.printAsync({ html });
}
