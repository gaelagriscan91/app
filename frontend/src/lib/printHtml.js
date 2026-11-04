// Safe helpers for the printable HTML windows (QR credentials, receipts, tickets)
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

// Opens printable HTML in a new window via a Blob URL (no document.write)
export function openHtmlWindow(html, features) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const win = window.open(url, "_blank", features);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return win;
}
