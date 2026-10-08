import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { CalendarCheck, FileSpreadsheet, Boxes, LogOut, Home, Sprout } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import LogoHandCherry from "@/components/LogoHandCherry";

const navItems = [
  { to: "/", label: "Inicio", icon: Home, testid: "nav-dashboard" },
  { to: "/cosecha", label: "Cosecha", icon: Sprout, testid: "nav-cosecha" },
  { to: "/dia", label: "Día", icon: CalendarCheck, testid: "nav-lista-dia" },
  { to: "/reportes", label: "Reportes", icon: FileSpreadsheet, testid: "nav-reportes" },
  { to: "/modulos", label: "Módulos", icon: Boxes, testid: "nav-modulos" },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#F7F5EE] pb-24">
      {/* Header */}
      <header className="bg-[#1D4ED8] text-white sticky top-0 z-40 shadow-md">
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
      <main className="max-w-5xl mx-auto px-4 py-5 sm:py-7">
        <Outlet />
      </main>

      {/* Bottom nav (mobile + desktop) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2DDD0] shadow-[0_-6px_24px_rgba(30,70,32,0.08)] z-40">
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
