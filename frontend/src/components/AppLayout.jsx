import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { ClipboardList, CalendarCheck, FileSpreadsheet, Boxes, LogOut, Home, ScanLine, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import LogoHandCherry from "@/components/LogoHandCherry";
import BlockedAccount from "@/pages/BlockedAccount";

const navItems = [
  { to: "/", label: "Inicio", icon: Home, testid: "nav-dashboard" },
  { to: "/registrar", label: "Cosechar", icon: ClipboardList, testid: "nav-registrar-cosecha" },
  { to: "/asistencia", label: "Asistencia", icon: ScanLine, testid: "nav-asistencia" },
  { to: "/dia", label: "Día", icon: CalendarCheck, testid: "nav-lista-dia" },
  { to: "/reportes", label: "Reportes", icon: FileSpreadsheet, testid: "nav-reportes" },
  { to: "/modulos", label: "Módulos", icon: Boxes, testid: "nav-modulos" },
];

export default function AppLayout() {
  const { user, logout, blocked } = useAuth();
  const navigate = useNavigate();
  // Inicio is a full-bleed column (list scrolls inside, action panel pinned above the nav)
  const fullBleed = useLocation().pathname === "/" && !blocked;

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

      {/* Content */}
      <div className={`flex-1 min-h-0 ${fullBleed ? "flex flex-col" : "overflow-y-auto"}`}>
        <main className={fullBleed ? "flex-1 min-h-0 w-full max-w-5xl mx-auto flex flex-col" : "max-w-5xl mx-auto px-4 py-5 sm:py-7"}>
          {blocked ? <BlockedAccount /> : <Outlet />}
        </main>
      </div>

      {/* Bottom nav (mobile + desktop) */}
      <nav className="shrink-0 relative pb-[env(safe-area-inset-bottom)] bg-white border-t-2 border-[#E2DDD0] shadow-[0_-6px_24px_rgba(30,70,32,0.08)] z-40">
        <div className="max-w-5xl mx-auto grid grid-cols-6">
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
                  <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all ${isActive ? "bg-[#1D4ED8] text-white shadow-md scale-105" : "bg-transparent"} ${blocked ? "opacity-50" : ""}`}>
                    <Icon className="w-5 h-5" strokeWidth={2.3} />
                    {blocked && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#B45309] text-white flex items-center justify-center shadow" data-testid={`${testid}-lock`}>
                        <Lock className="w-3 h-3" strokeWidth={2.8} />
                      </span>
                    )}
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
