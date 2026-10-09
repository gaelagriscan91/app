import { useEffect, useState } from "react";
import { Lock, Mail, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const SUPPORT_EMAIL = "gaelagriscan@gmail.com";

const PERKS = ["Registrar cosechas y escanear QR", "Check in / Check out de trabajadores", "Exportar recibos y reportes a Excel"];

export default function PaywallDialog() {
  const { paywallOpen, setPaywallOpen, refresh } = useAuth();
  const [billing, setBilling] = useState(null);
  const [paying, setPaying] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!paywallOpen) return;
    api.get("/billing/status").then(({ data }) => setBilling(data)).catch(() => setBilling({ configured: false, price: "29.99" }));
  }, [paywallOpen]);

  const pay = async () => {
    setPaying(true);
    try {
      const { data } = await api.post("/billing/subscribe");
      if (data.approve_url) window.location.href = data.approve_url;
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo iniciar el pago");
      setPaying(false);
    }
  };

  const recheck = async () => {
    setChecking(true);
    const ok = await refresh();
    setChecking(false);
    if (ok) { toast.success("¡Cuenta desbloqueada!"); setPaywallOpen(false); }
    else toast.info("Tu cuenta sigue bloqueada");
  };

  const price = billing?.price || "29.99";

  return (
    <Dialog open={paywallOpen} onOpenChange={setPaywallOpen}>
      <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden border-0" data-testid="paywall-dialog">
        <div className="bg-[#1F2E52] text-white px-6 pt-7 pb-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-3">
            <Lock className="w-7 h-7 text-[#F59E0B]" />
          </div>
          <DialogTitle className="text-xl font-extrabold" style={{ fontFamily: "Outfit, sans-serif" }} data-testid="blocked-title">
            Cuenta bloqueada
          </DialogTitle>
          <DialogDescription className="text-white/80 text-sm mt-1">
            Puedes ver la app, pero para registrar, escanear, guardar y exportar necesitas activar tu plan.
          </DialogDescription>
          <div className="mt-4 flex items-end justify-center gap-1" data-testid="paywall-price">
            <span className="text-4xl font-extrabold font-mono-stat">${price}</span>
            <span className="text-white/80 text-sm mb-1.5">USD / mes</span>
          </div>
          <p className="text-[11px] text-white/70">Se cobra cada mes · Cancela cuando quieras</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <ul className="space-y-2">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-2 text-sm text-[#1F2E52] font-semibold">
                <CheckCircle2 className="w-4 h-4 text-[#6B9E2A] shrink-0" /> {p}
              </li>
            ))}
          </ul>

          {billing && !billing.configured ? (
            <div className="rounded-xl bg-[#FEF3C7] text-[#92400E] text-sm font-semibold p-3 text-center" data-testid="paywall-not-configured">
              El pago con PayPal se activará muy pronto. Mientras, escríbenos para desbloquear tu cuenta.
            </div>
          ) : (
            <button
              onClick={pay}
              disabled={paying || !billing}
              className="w-full h-13 py-3.5 rounded-2xl bg-[#FFC439] hover:bg-[#F2B92F] text-[#003087] font-extrabold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              data-testid="paywall-paypal-button"
            >
              {paying ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Pagar con <span className="italic">PayPal</span></>}
            </button>
          )}

          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Desbloquear mi cuenta de AgriScan")}`}
            className="flex items-center justify-center gap-2 w-full rounded-2xl border-2 border-[#8DC63F] bg-[#F3F7EC] py-3 px-3 text-[#1F2E52] text-sm font-bold hover:bg-[#E8F2DA] transition-colors break-all"
            data-testid="blocked-support-email"
          >
            <Mail className="w-4 h-4 shrink-0 text-[#6B9E2A]" /> {SUPPORT_EMAIL}
          </a>

          <button
            onClick={recheck}
            disabled={checking}
            className="w-full h-11 rounded-xl text-[#1F2E52] font-bold flex items-center justify-center gap-2 hover:bg-[#F3F4F6] transition-colors disabled:opacity-60"
            data-testid="blocked-recheck-button"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Ya pagué / ya me desbloquearon
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
