import { useState } from "react";
import { Lock, Mail, RefreshCw, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const SUPPORT_EMAIL = "gaelagriscan@gmail.com";

export default function BlockedAccount() {
  const { refresh, logout } = useAuth();
  const [checking, setChecking] = useState(false);

  const recheck = async () => {
    setChecking(true);
    const ok = await refresh();
    setChecking(false);
    if (ok) toast.success("¡Cuenta desbloqueada! Bienvenido");
    else toast.info("Tu cuenta sigue bloqueada");
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-5 py-8" data-testid="blocked-account-screen">
      <div className="w-full max-w-sm bg-white rounded-3xl p-7 text-center shadow-xl border-2 border-[#E2DDD0] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mx-auto w-16 h-16 rounded-full bg-[#FEF3C7] flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-[#B45309]" />
        </div>
        <h2 className="text-xl font-extrabold text-[#1F2E52] mb-2" style={{ fontFamily: "Outfit, sans-serif" }} data-testid="blocked-title">
          Cuenta bloqueada
        </h2>
        <p className="text-sm text-[#556047] font-medium mb-5">
          Esta sección está bloqueada. Tu cuenta está en espera de aprobación; escríbenos para desbloquearla y usar AgriScan.
        </p>

        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Desbloquear mi cuenta de AgriScan")}`}
          className="flex items-center justify-center gap-2 w-full rounded-2xl bg-[#F3F7EC] border-2 border-[#8DC63F] py-3.5 px-3 text-[#1F2E52] font-bold hover:bg-[#E8F2DA] transition-colors break-all"
          data-testid="blocked-support-email"
        >
          <Mail className="w-5 h-5 shrink-0 text-[#6B9E2A]" />
          {SUPPORT_EMAIL}
        </a>

        <button
          onClick={recheck}
          disabled={checking}
          className="mt-4 w-full h-12 rounded-xl bg-[#8DC63F] hover:bg-[#7DB52F] text-white font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          data-testid="blocked-recheck-button"
        >
          {checking ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
          Ya me desbloquearon
        </button>
        <button
          onClick={logout}
          className="mt-3 w-full h-11 rounded-xl text-[#1F2E52] font-bold flex items-center justify-center gap-2 hover:bg-[#F3F4F6] transition-colors"
          data-testid="blocked-logout-button"
        >
          <LogOut className="w-4 h-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
