// Shared camera stream: ask permission once and reuse it, so the browser
// does not prompt again every time the scanner opens.
const IDLE_MS = 5 * 60 * 1000;
let stream = null;
let pending = null;
let idleTimer = null;

const isLive = (s) => s && s.getVideoTracks().some((t) => t.readyState === "live" && !t.muted && t.enabled);

export function resetCamera() {
  clearTimeout(idleTimer);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

export async function acquireCamera() {
  clearTimeout(idleTimer);
  if (isLive(stream)) return stream;
  if (!pending) {
    pending = navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((s) => { stream = s; return s; })
      .finally(() => { pending = null; });
  }
  return pending;
}

export function releaseCamera() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }, IDLE_MS);
}
