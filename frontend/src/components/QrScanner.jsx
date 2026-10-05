import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, X } from "lucide-react";

/**
 * QR Scanner component. Calls onScan(decodedText) on each successful scan.
 * The parent is responsible for stopping/restarting via `active` prop.
 * When `fullscreen` is true, renders as an overlay filling the viewport.
 */
export default function QrScanner({ onScan, active = true, fullscreen = false, onClose, title = "Enfoca el QR" }) {
  const containerId = "qr-reader-container";
  const scannerRef = useRef(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const stop = async () => {
    const s = scannerRef.current;
    if (!s) return;
    try {
      if (s.getState && s.getState() === 2 /* SCANNING */) {
        await s.stop();
      }
      await s.clear();
    } catch (_) {}
    scannerRef.current = null;
    setRunning(false);
  };

  const start = async () => {
    setError("");
    setStarting(true);
    try {
      if (scannerRef.current) {
        await stop();
      }
      const s = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = s;
      await s.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
        (decodedText) => { onScan?.(decodedText); },
        () => {}
      );
      setRunning(true);
    } catch (e) {
      setError(typeof e === "string" ? e : e?.message || "No se pudo acceder a la cámara. Verifica permisos.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (active) start();
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col" data-testid="qr-scanner-fullscreen">
        <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Camera className="w-4 h-4" /> {title}
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
            data-testid="qr-fullscreen-close"
            aria-label="Cerrar cámara"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="relative flex-1 overflow-hidden qr-square-wrap">
          <div id={containerId} className="absolute inset-0" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative w-[70%] max-w-sm aspect-square">
              <span className="absolute -top-0.5 -left-0.5 w-12 h-12 border-t-4 border-l-4 border-[#2563EB] rounded-tl-xl" />
              <span className="absolute -top-0.5 -right-0.5 w-12 h-12 border-t-4 border-r-4 border-[#2563EB] rounded-tr-xl" />
              <span className="absolute -bottom-0.5 -left-0.5 w-12 h-12 border-b-4 border-l-4 border-[#2563EB] rounded-bl-xl" />
              <span className="absolute -bottom-0.5 -right-0.5 w-12 h-12 border-b-4 border-r-4 border-[#2563EB] rounded-br-xl" />
            </div>
          </div>
          {error && (
            <div className="absolute inset-x-4 bottom-6 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold flex items-start gap-2">
              <CameraOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="qr-scanner-wrapper">
      <div className="relative w-full aspect-square max-w-sm mx-auto rounded-2xl overflow-hidden bg-[#1A2210] border-2 border-[#1A2210] shadow-inner qr-square-wrap">
        <div id={containerId} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-[65%] aspect-square">
            <span className="absolute -top-0.5 -left-0.5 w-8 h-8 border-t-4 border-l-4 border-[#2563EB] rounded-tl-xl" />
            <span className="absolute -top-0.5 -right-0.5 w-8 h-8 border-t-4 border-r-4 border-[#2563EB] rounded-tr-xl" />
            <span className="absolute -bottom-0.5 -left-0.5 w-8 h-8 border-b-4 border-l-4 border-[#2563EB] rounded-bl-xl" />
            <span className="absolute -bottom-0.5 -right-0.5 w-8 h-8 border-b-4 border-r-4 border-[#2563EB] rounded-br-xl" />
          </div>
        </div>
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold flex items-start gap-2">
          <CameraOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {!starting && !error && (
        <div className="flex items-center justify-center gap-2 text-xs text-[#556047] font-semibold">
          <Camera className="w-4 h-4" />
          {running ? "Enfoca el QR del trabajador" : "Cámara detenida"}
        </div>
      )}
    </div>
  );
}
