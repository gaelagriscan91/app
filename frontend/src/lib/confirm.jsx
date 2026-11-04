import { useEffect, useState } from "react";

let listener = null;

// In-app confirm: window.confirm is blocked in many in-app browsers / WebViews.
export function confirmAction(message, confirmText = "Sí, continuar") {
  return new Promise((resolve) => {
    if (listener) listener({ message, confirmText, resolve });
    else resolve(window.confirm(message));
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  useEffect(() => {
    listener = setReq;
    return () => { listener = null; };
  }, []);
  if (!req) return null;
  const close = (v) => { req.resolve(v); setReq(null); };
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => close(false)} data-testid="confirm-dialog">
      <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-[#1A2210] font-semibold text-base mb-5" data-testid="confirm-message">{req.message}</p>
        <div className="flex gap-3">
          <button onClick={() => close(false)} className="flex-1 h-12 rounded-xl bg-[#F0EDE1] text-[#1A2210] font-bold" data-testid="confirm-cancel">Cancelar</button>
          <button onClick={() => close(true)} className="flex-1 h-12 rounded-xl bg-[#DC2626] text-white font-bold" data-testid="confirm-ok">{req.confirmText}</button>
        </div>
      </div>
    </div>
  );
}
