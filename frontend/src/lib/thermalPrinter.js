/**
 * Thermal printer helper using Web Bluetooth API with ESC/POS commands.
 * Compatible with 58mm & 80mm Bluetooth thermal printers (GOOJPRT, HOIN, etc.)
 * NOTE: Requires HTTPS, user gesture to connect, and Chrome/Edge (Android or desktop).
 */

const PRINTER_SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb"; // common ESC/POS BLE service
const PRINTER_CHAR_UUID = "00002af1-0000-1000-8000-00805f9b34fb";

const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  INIT: new Uint8Array([ESC, 0x40]),
  BOLD_ON: new Uint8Array([ESC, 0x45, 0x01]),
  BOLD_OFF: new Uint8Array([ESC, 0x45, 0x00]),
  ALIGN_LEFT: new Uint8Array([ESC, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([ESC, 0x61, 0x02]),
  SIZE_NORMAL: new Uint8Array([GS, 0x21, 0x00]),
  SIZE_DOUBLE: new Uint8Array([GS, 0x21, 0x11]),
  SIZE_DOUBLE_HEIGHT: new Uint8Array([GS, 0x21, 0x01]),
  FEED: (n = 1) => new Uint8Array([ESC, 0x64, n]),
  CUT: new Uint8Array([GS, 0x56, 0x42, 0x00]),
  LINE: new Uint8Array([0x0a]),
};

function concat(...arrays) {
  let totalLen = 0;
  for (const a of arrays) totalLen += a.length;
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function encodeText(text) {
  // Latin-1 (CP850-ish). Many thermal printers default to CP437/CP850.
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i] = c > 0xff ? 0x3f : c; // non-ASCII fallback
  }
  return out;
}

class ThermalPrinter {
  constructor() {
    this.device = null;
    this.characteristic = null;
  }

  isSupported() {
    return typeof navigator !== "undefined" && !!navigator.bluetooth;
  }

  async connect() {
    if (!this.isSupported()) {
      throw new Error("Bluetooth no soportado en este navegador. Usa Chrome/Edge en Android o PC.");
    }
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [PRINTER_SERVICE_UUID] }],
      optionalServices: [PRINTER_SERVICE_UUID],
    });
    this.device = device;
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
    this.characteristic = await service.getCharacteristic(PRINTER_CHAR_UUID);
    return device.name || "Impresora térmica";
  }

  isConnected() {
    return this.device?.gatt?.connected && !!this.characteristic;
  }

  async disconnect() {
    try { this.device?.gatt?.disconnect(); } catch (_) {}
    this.device = null;
    this.characteristic = null;
  }

  async writeChunks(bytes) {
    if (!this.characteristic) throw new Error("Impresora no conectada");
    const CHUNK = 180;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const slice = bytes.slice(i, i + CHUNK);
      try {
        await this.characteristic.writeValueWithoutResponse(slice);
      } catch (_) {
        await this.characteristic.writeValue(slice);
      }
    }
  }

  async print(parts) {
    const chunks = [CMD.INIT];
    for (const p of parts) {
      if (p.align === "center") chunks.push(CMD.ALIGN_CENTER);
      else if (p.align === "right") chunks.push(CMD.ALIGN_RIGHT);
      else chunks.push(CMD.ALIGN_LEFT);
      if (p.size === "double") chunks.push(CMD.SIZE_DOUBLE);
      else if (p.size === "big") chunks.push(CMD.SIZE_DOUBLE_HEIGHT);
      else chunks.push(CMD.SIZE_NORMAL);
      if (p.bold) chunks.push(CMD.BOLD_ON);
      chunks.push(encodeText(p.text || ""));
      if (p.bold) chunks.push(CMD.BOLD_OFF);
      chunks.push(CMD.LINE);
    }
    chunks.push(CMD.FEED(3));
    try { chunks.push(CMD.CUT); } catch (_) {}
    await this.writeChunks(concat(...chunks));
  }
}

export const thermalPrinter = new ThermalPrinter();

/** Build receipt parts from a receipt object (per-worker summary) */
export function buildReceiptLines(receipt, options = {}) {
  const businessName = options.businessName || "AgriScan";
  const fmtMoney = (n) =>
    Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

  const WIDTH = 32; // 58mm roughly fits 32 chars
  const pad = (left, right, w = WIDTH) => {
    left = String(left ?? "");
    right = String(right ?? "");
    const spaces = Math.max(1, w - left.length - right.length);
    return left + " ".repeat(spaces) + right;
  };
  const sep = "-".repeat(WIDTH);

  const parts = [];
  parts.push({ text: businessName, align: "center", bold: true, size: "double" });
  parts.push({ text: "Recibo de pago", align: "center", bold: true });
  parts.push({ text: `${receipt.date_from} / ${receipt.date_to}`, align: "center" });
  parts.push({ text: sep });

  parts.push({ text: receipt.worker_name, bold: true });
  if (receipt.document_id) parts.push({ text: `ID: ${receipt.document_id}` });
  if (receipt.role) parts.push({ text: `Rol: ${receipt.role}` });
  const uniq = (k) => [...new Set((receipt.harvests || []).map((h) => (h[k] || "").trim()).filter(Boolean))].join(", ");
  if (uniq("mayordomo")) parts.push({ text: `Mayordomo: ${uniq("mayordomo")}` });
  if (uniq("grower")) parts.push({ text: `Grower: ${uniq("grower")}` });
  parts.push({ text: sep });

  parts.push({ text: pad("Horas:", (receipt.total_hours || 0).toFixed(2) + " h") });
  parts.push({ text: pad("Dias:", String(receipt.days_worked || 0)) });
  parts.push({ text: pad("Kilos:", (receipt.total_kilos || 0).toFixed(2)) });
  parts.push({ text: pad("Unidades:", Math.round(receipt.total_units || 0).toString()) });
  parts.push({ text: sep });

  if ((receipt.harvests || []).length) {
    parts.push({ text: "COSECHAS", bold: true });
    for (const h of receipt.harvests) {
      parts.push({ text: `${h.date} ${h.product_name}`.slice(0, WIDTH) });
      const detail = `${h.kilos ? h.kilos.toFixed(1) + "Kg " : ""}${h.units ? Math.round(h.units) + "u" : ""}`.trim();
      parts.push({ text: pad("  " + detail, fmtMoney(h.payment)) });
    }
    parts.push({ text: sep });
  }

  parts.push({ text: "TOTAL A PAGAR", bold: true, align: "center" });
  parts.push({ text: fmtMoney(receipt.total_payment), align: "center", size: "double", bold: true });
  parts.push({ text: sep });

  parts.push({ text: "" });
  parts.push({ text: "Firma: _________________", align: "left" });
  parts.push({ text: "" });
  parts.push({ text: new Date().toLocaleString("es-MX"), align: "center" });
  parts.push({ text: "Gracias por su trabajo!", align: "center" });

  return parts;
}

/** HTML template for ticket-format printing (narrow 80mm) via browser print */
export function receiptTicketHtml(receipt, businessName = "AgriScan") {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtMoney = (n) =>
    Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso + "T00:00:00");
      return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch (_) { return iso; }
  };
  const harvRows = (receipt.harvests || []).map((h) => `
    <div class="row"><span>${fmtDate(h.date)} ${esc((h.product_name || "").slice(0, 10))}</span><span>${fmtMoney(h.payment)}</span></div>
    <div class="sub">${h.kilos ? h.kilos.toFixed(2) + "Kg " : ""}${h.units ? Math.round(h.units) + " " + esc(h.unit_label) : ""}</div>
  `).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  @media print { .no-print { display: none; } body { width: 72mm; } }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: 72mm; margin: 0 auto; padding: 4mm; color: #000; background: white; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
  .sub-brand { text-align: center; font-size: 9px; margin-bottom: 4px; }
  .range { text-align: center; margin-bottom: 6px; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .worker { font-weight: bold; margin: 2px 0; }
  .meta { font-size: 10px; margin-bottom: 4px; }
  .row { display: flex; justify-content: space-between; margin: 2px 0; }
  .big { font-size: 20px; text-align: center; font-weight: bold; margin: 6px 0; }
  .footer { text-align: center; font-size: 9px; margin-top: 10px; }
  .sub { font-size: 9px; color: #333; margin-left: 8px; }
  .section-title { font-weight: bold; margin-top: 4px; }
  .sign { margin-top: 20px; font-size: 10px; }
  .print-btn { position: fixed; top: 8px; right: 8px; background: #1D4ED8; color: white; padding: 6px 10px; border: none; border-radius: 4px; font-weight: bold; font-size: 11px; }
</style></head><body>
  <button class="print-btn no-print" onclick="window.print()">Imprimir</button>
  <h1>${esc(businessName)}</h1>
  <div class="sub-brand">RECIBO DE PAGO</div>
  <div class="range">${fmtDate(receipt.date_from)} - ${fmtDate(receipt.date_to)}</div>
  <hr>
  <div class="worker">${esc(receipt.worker_name)}</div>
  <div class="meta">${esc(receipt.document_id || "sin ID")}${receipt.role ? " / " + esc(receipt.role) : ""}</div>
  <hr>
  <div class="row"><span>Horas trab.:</span><span>${(receipt.total_hours || 0).toFixed(2)} h</span></div>
  <div class="row"><span>Dias trab.:</span><span>${receipt.days_worked || 0}</span></div>
  <div class="row"><span>Kilos total:</span><span>${(receipt.total_kilos || 0).toFixed(2)}</span></div>
  <div class="row"><span>Unidades:</span><span>${Math.round(receipt.total_units || 0)}</span></div>
  ${harvRows ? `<hr><div class="section-title">DETALLE</div>${harvRows}` : ""}
  <hr>
  <div class="section-title" style="text-align:center">TOTAL A PAGAR</div>
  <div class="big">${fmtMoney(receipt.total_payment)}</div>
  <hr>
  <div class="sign">Firma empleado:</div>
  <div class="sign">_______________________</div>
  <div class="footer">${new Date().toLocaleString("es-MX")}<br>Gracias por su trabajo!</div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;
}
