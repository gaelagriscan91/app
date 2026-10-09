import { useEffect, useState } from "react";
import { CreditCard, Loader2, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

import { SUPPORT_EMAIL, WHATSAPP_URL } from "@/lib/support";

function ContactCard() {
  return (
    <div className="field-card p-5 space-y-3" data-testid="support-contact-card">
      <div>
        <div className="font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>Contactar AgriScan</div>
        <div className="text-sm text-[#556047] font-semibold">¿Cómo te puedo ayudar?</div>
      </div>
      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl bg-[#25D366] hover:bg-[#1EBE5A] text-white px-4 py-3 font-bold transition-colors" data-testid="support-whatsapp-link">
        <MessageCircle className="w-5 h-5 shrink-0" />
        <span className="flex-1">WhatsApp</span>
        <span className="font-mono-stat">(509) 317-3565</span>
      </a>
      <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Ayuda con AgriScan")}`} className="flex items-center gap-3 rounded-xl border-2 border-[#E2DDD0] hover:bg-[#F7F5EE] text-[#1A2210] px-4 py-3 font-bold transition-colors break-all" data-testid="support-email-link">
        <Mail className="w-5 h-5 shrink-0 text-[#1D4ED8]" /> {SUPPORT_EMAIL}
      </a>
    </div>
  );
}

const STATUS = { ACTIVE: "Activa", CANCELLED: "Cancelada", SUSPENDED: "Suspendida", EXPIRED: "Vencida", APPROVAL_PENDING: "Pendiente de pago" };

export default function SubscriptionTab() {
  const { blocked, setPaywallOpen, refresh, user } = useAuth();
  const [billing, setBilling] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const load = () => api.get("/billing/status").then(({ data }) => setBilling(data)).catch(() => setBilling({}));
  useEffect(() => { load(); }, []);

  const cancel = async () => {
    if (!window.confirm("¿Cancelar tu suscripción de AgriScan? Seguirás teniendo acceso hasta el fin del mes pagado.")) return;
    setCancelling(true);
    try {
      await api.post("/billing/cancel");
      toast.success("Suscripción cancelada");
      await load();
      await refresh();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo cancelar");
    } finally {
      setCancelling(false);
    }
  };

  if (!billing) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8]" /></div>;
  const until = billing.paid_until ? new Date(billing.paid_until).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <div className="space-y-4">
    <div className="field-card p-5 space-y-4" data-testid="subscription-tab">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-[#EEF2FF] flex items-center justify-center"><CreditCard className="w-5 h-5 text-[#1D4ED8]" /></div>
        <div>
          <div className="font-extrabold text-[#1A2210]">Plan AgriScan · ${billing.price || "29.99"} USD/mes</div>
          <div className="text-sm text-[#556047] font-semibold" data-testid="subscription-status">
            Estado: {blocked ? "Bloqueada" : user?.trial_ends_at ? "Prueba gratis" : STATUS[billing.status] || (billing.status ? billing.status : "Activa por el administrador")}
            {until ? ` · Pagado hasta ${until}` : ""}
          </div>
        </div>
      </div>
      {billing.status === "ACTIVE" ? (
        <button onClick={cancel} disabled={cancelling} className="w-full h-11 rounded-xl border-2 border-red-300 text-red-700 font-bold hover:bg-red-50 transition-colors disabled:opacity-60" data-testid="subscription-cancel-button">
          {cancelling ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Cancelar suscripción"}
        </button>
      ) : blocked ? (
        <button onClick={() => setPaywallOpen(true)} className="w-full h-11 rounded-xl bg-[#FFC439] text-[#003087] font-extrabold hover:bg-[#F2B92F] transition-colors" data-testid="subscription-pay-button">
          Pagar $29.99/mes
        </button>
      ) : null}
    </div>
    <ContactCard />
    </div>
  );
}
