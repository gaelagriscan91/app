import { useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { ClipboardList, CalendarCheck, FileSpreadsheet, Boxes, LogOut, ScanLine, Lock, Gift } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import LogoHandCherry from "@/components/LogoHandCherry";
import PaywallDialog from "@/components/PaywallDialog";

function TrialBanner({ endsAt, onPay }) {
  const ms = new Date(endsAt).getTime() - Date.now();
  const days = Math.max(0, Math.floor(ms / 86400000));
  const hours = Math.max(0, Math.floor((ms % 86400000) / 3600000));
  const left = days > 0 ? `${days} día${days !== 1 ? "s" : ""}${hours ? ` ${hours} h` : ""}` : `${hours} h`;
  return (
    <button onClick={onPay} className="shrink-0 w-full bg-[#ECFDF5] border-b-2 border-[#10B981] px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[#D1FAE5] transition-colors" data-testid="trial-banner">
      <span className="flex items-center gap-2 text-sm font-bold text-[#065F46] min-w-0 whitespace-nowrap">
        <Gift className="w-4 h-4 shrink-0" /> <span className="truncate">Prueba gratis: quedan <span data-testid="trial-time-left">{left}</span></span>
      </span>
      <span className="shrink-0 bg-[#FFC439] text-[#003087] text-xs font-extrabold px-3 py-1.5 rounded-full">Activar plan</span>
    </button>
  );
}

const navItems = [
  { to: "/registrar", label: "Cosechar", icon: ClipboardList, testid: "nav-registrar-cosecha" },
  { to: "/asistencia", label: "Asistencia", icon: ScanLine, testid: "nav-asistencia" },
  { to: "/dia", label: "Día", icon: CalendarCheck, testid: "nav-lista-dia" },
  { to: "/reportes", label: "Reportes", icon: FileSpreadsheet, testid: "nav-reportes" },
  { to: "/modulos", label: "Módulos", icon: Boxes, testid: "nav-modulos" },
];

export default function AppLayout() {
  const { user, logout, blocked, setPaywallOpen, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Inicio is a full-bleed column (list scrolls inside, action panel pinned above the nav)
  const fullBleed = location.pathname === "/";

  // PayPal return (?billing=return&subscription_id=...) + periodic subscription re-sync
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const flag = q.get("billing");
    const subId = q.get("subscription_id");
    if (flag === "return" && subId) {
      api.post("/billing/confirm", { subscription_id: subId })
        .then(async ({ data }) => {
          const ok = await refresh();
          if (data.active && ok) toast.success("¡Pago recibido! Tu cuenta está desbloqueada");
          else toast.info("Pago en proceso. Se desbloqueará en cuanto PayPal lo confirme.");
        })
        .catch(() => toast.error("No se pudo confirmar el pago"))
        .finally(() => navigate("/", { replace: true }));
    } else if (flag === "cancel") {
      toast.info("Pago cancelado");
      navigate("/", { replace: true });
    } else if (user && user.role !== "admin") {
      api.get("/billing/status").then(({ data }) => { if (data.blocked !== !!blocked) refresh(); }).catch(() => {});
    }
    // eslint-disable-next-line
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="app-shell flex flex-col bg-[#F7F5EE]">
      {/* Header */}
      <header className="bg-[#1D4ED8] text-white shrink-0 relative z-40 shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoHandCherry size={42} className="flex-shrink-0" />
            <div>
              <div className="font-extrabold text-lg leading-tight tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
                AgriScan
              </div>
              <div className="text-[11px] text-blue-100 leading-tight">
                Control de cosechas
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-semibold leading-tight flex items-center gap-1.5 justify-end" data-testid="header-user-name">
                {user?.name}
                {user?.role === "admin" && (
                  <span className="bg-[#2563EB] text-white px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider" data-testid="admin-badge">
                    Admin
                  </span>
                )}
              </div>
              <div className="text-[11px] text-blue-200 leading-tight">{user?.email}</div>
            </div>
            {user?.role === "admin" && (
              <span className="sm:hidden bg-[#2563EB] text-white px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider" data-testid="admin-badge-mobile">
                Admin
              </span>
            )}
            <button
              onClick={handleLogout}
              className="h-10 px-3 rounded-lg bg-[#1E3A8A] hover:bg-[#0e2410] text-white text-sm font-semibold flex items-center gap-1.5 transition-colors border border-blue-800"
              data-testid="logout-button"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {blocked && (
        <button
          onClick={() => setPaywallOpen(true)}
          className="shrink-0 w-full bg-[#FEF3C7] border-b-2 border-[#F59E0B] px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[#FDE68A] transition-colors"
          data-testid="blocked-banner"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-[#92400E]">
            <Lock className="w-4 h-4 shrink-0" /> {user?.trial_used ? "Tu prueba gratis terminó" : "Cuenta bloqueada — solo puedes ver"}
          </span>
          <span className="shrink-0 bg-[#FFC439] text-[#003087] text-xs font-extrabold px-3 py-1.5 rounded-full">Pagar $29.99/mes</span>
        </button>
      )}
      {!blocked && user?.trial_ends_at && <TrialBanner endsAt={user.trial_ends_at} onPay={() => setPaywallOpen(true)} />}
      <PaywallDialog />

      {/* Content */}
      <div className={`flex-1 min-h-0 ${fullBleed ? "flex flex-col" : "overflow-y-auto"}`}>
        <main className={fullBleed ? "flex-1 min-h-0 w-full max-w-5xl mx-auto flex flex-col" : "max-w-5xl mx-auto px-4 py-5 sm:py-7"}>
          <Outlet />
        </main>
      </div>

      {/* Bottom nav (mobile + desktop) */}
      <nav className="shrink-0 relative pb-[env(safe-area-inset-bottom)] bg-white border-t-2 border-[#E2DDD0] shadow-[0_-6px_24px_rgba(30,70,32,0.08)] z-40">
        <div className="max-w-5xl mx-auto grid grid-cols-5">
          {navItems.map(({ to, label, icon: Icon, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-testid={testid}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                  isActive
                    ? "text-[#1D4ED8]"
                    : "text-[#889078] hover:text-[#1D4ED8]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${isActive ? "bg-[#1D4ED8] text-white shadow-md scale-105" : "bg-transparent"}`}>
                    <Icon className="w-5 h-5" strokeWidth={2.3} />
                  </div>
                  <span className="text-[11px] font-semibold leading-tight">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
