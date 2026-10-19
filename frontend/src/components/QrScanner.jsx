import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, X } from "lucide-react";
import { acquireCamera, releaseCamera, resetCamera } from "@/lib/cameraStream";
import { playScanBeep } from "@/lib/sounds";

export default function QrScanner({ onScan, active = true, fullscreen = false, onClose, title = "Enfoca el QR" }) {
  const videoRef = useRef(null);
  const loopRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const stop = () => {
    cancelAnimationFrame(loopRef.current);
    loopRef.current = 0;
    const v = videoRef.current;
    if (v) { v.pause(); v.srcObject = null; }
    releaseCamera();
    setRunning(false);
  };

  const attach = async (v, stream) => {
    v.muted = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.srcObject = stream;
    try { await v.play(); } catch (err) { if (err?.name !== "AbortError") throw err; }
    // iOS can hand back a reused stream that shows only black frames: wait for real frames
    for (let i = 0; i < 20; i++) {
      if (v.videoWidth > 0 && v.readyState >= 2) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  const start = async () => {
    setError("");
    setStarting(true);
    try {
      let stream = await acquireCamera();
      const v = videoRef.current;
      if (!v) return;
      if (!(await attach(v, stream))) {
        resetCamera();
        stream = await acquireCamera();
        if (!videoRef.current) return;
        await attach(v, stream);
      }
      setRunning(true);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let last = 0;
      let lastCode = "";
      let lastAt = 0;
      const tick = (t) => {
        loopRef.current = requestAnimationFrame(tick);
        if (t - last < 100 || v.readyState < 2 || !v.videoWidth) return;
        last = t;
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          if (code.data !== lastCode || t - lastAt > 1500) playScanBeep();
          lastCode = code.data;
          lastAt = t;
          onScanRef.current?.(code.data);
        }
      };
      loopRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(e?.name === "NotAllowedError" ? "Permiso de cámara denegado. Actívalo en Ajustes del navegador." : e?.message || "No se pudo acceder a la cámara. Verifica permisos.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (active) start();
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const video = <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay data-testid="qr-video" />;

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
          {video}
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
        {video}
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
          {running ? "Enfoca el QR del empleado" : "Cámara detenida"}
        </div>
      )}
    </div>
  );
}
