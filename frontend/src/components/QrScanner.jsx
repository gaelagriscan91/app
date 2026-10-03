import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, Loader2 } from "lucide-react";

/**
 * QR Scanner component. Calls onScan(decodedText) on each successful scan.
 * The parent is responsible for stopping/restarting via `active` prop.
 */
export default function QrScanner({ onScan, active = true }) {
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
        (decodedText) => {
          onScan?.(decodedText);
        },
        () => {}
      );
      setRunning(true);
    } catch (e) {
      setError(
        typeof e === "string"
          ? e
          : e?.message || "No se pudo acceder a la cámara. Verifica permisos."
      );
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (active) start();
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="space-y-3" data-testid="qr-scanner-wrapper">
      <div className="relative w-full aspect-square max-w-sm mx-auto rounded-2xl overflow-hidden bg-[#1A2210] border-2 border-[#1A2210] shadow-inner qr-square-wrap">
        <div id={containerId} className="absolute inset-0" />
        {/* Visor overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-[65%] aspect-square">
            <span className="absolute -top-0.5 -left-0.5 w-8 h-8 border-t-4 border-l-4 border-[#F4B860] rounded-tl-xl" />
            <span className="absolute -top-0.5 -right-0.5 w-8 h-8 border-t-4 border-r-4 border-[#F4B860] rounded-tr-xl" />
            <span className="absolute -bottom-0.5 -left-0.5 w-8 h-8 border-b-4 border-l-4 border-[#F4B860] rounded-bl-xl" />
            <span className="absolute -bottom-0.5 -right-0.5 w-8 h-8 border-b-4 border-r-4 border-[#F4B860] rounded-br-xl" />
          </div>
        </div>
      </div>
      {starting && (
        <div className="flex items-center justify-center gap-2 text-sm text-[#556047] font-semibold">
          <Loader2 className="w-4 h-4 animate-spin" /> Encendiendo cámara…
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold flex items-start gap-2">
          <CameraOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {!starting && !error && (
        <div className="flex items-center justify-center gap-2 text-xs text-[#556047] font-semibold">
          <Camera className="w-4 h-4" />
          {running ? "Enfoca el código QR del trabajador" : "Cámara detenida"}
        </div>
      )}
    </div>
  );
}
