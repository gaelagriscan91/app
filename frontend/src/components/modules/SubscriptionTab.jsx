import { useEffect, useState } from "react";
import { Loader2, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { confirmAction } from "@/lib/confirm";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

import { SUPPORT_EMAIL, WHATSAPP_URL } from "@/lib/support";
import ChangePasswordCard from "@/components/modules/ChangePasswordCard";

function ContactCard() {
  return (
    <div className="field-card p-5 space-y-3" data-testid="support-contact-card">
      <div className="font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>Contactar AgriScan</div>
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


export default function SubscriptionTab() {
  const { refresh } = useAuth();
  const [billing, setBilling] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const load = () => api.get("/billing/status").then(({ data }) => setBilling(data)).catch(() => setBilling({}));
  useEffect(() => { load(); }, []);

  const cancel = async () => {
    if (!(await confirmAction("¿Cancelar tu suscripción de AgriScan? Seguirás teniendo acceso hasta el fin del mes pagado.", "Cancelar suscripción"))) return;
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

  return (
    <div className="space-y-4" data-testid="support-tab">
    <ContactCard />
    <ChangePasswordCard />
    {billing.status === "ACTIVE" && (
      <button onClick={cancel} disabled={cancelling} className="w-full h-11 rounded-xl border-2 border-red-300 text-red-700 font-bold hover:bg-red-50 transition-colors disabled:opacity-60" data-testid="subscription-cancel-button">
        {cancelling ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Cancelar suscripción"}
      </button>
    )}
    </div>
  );
}
