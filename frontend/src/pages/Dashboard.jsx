import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wheat, Users, DollarSign, TrendingUp, Loader2, ArrowRight, ScanLine, UserCheck } from "lucide-react";
import api, { formatCurrency, formatNumber } from "@/lib/api";

function StatCard({ label, value, sub, Icon, variant = "light", testid }) {
  const base = "rounded-2xl p-4 sm:p-5 border-2 shadow-sm transition-transform hover:-translate-y-0.5";
  const styles =
    variant === "dark"
      ? "bg-[#1E4620] border-[#153417] text-white"
      : variant === "accent"
      ? "bg-[#E65100] border-[#C63D00] text-white"
      : "bg-white border-[#E2DDD0] text-[#1A2210]";
  return (
    <div className={`${base} ${styles}`} data-testid={testid}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider ${variant === "light" ? "text-[#556047]" : "opacity-90"}`}>
            {label}
          </div>
          <div className="font-mono-stat text-2xl sm:text-3xl mt-1 leading-none">{value}</div>
          {sub ? <div className={`text-xs mt-1.5 font-semibold ${variant === "light" ? "text-[#556047]" : "opacity-85"}`}>{sub}</div> : null}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${variant === "light" ? "bg-[#F0EDE1] text-[#1E4620]" : "bg-white/15 text-white"}`}>
          <Icon className="w-5 h-5" strokeWidth={2.4} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/dashboard");
        setData(data);
      } catch (e) {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#1E4620]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
          Panel principal
        </h1>
        <p className="text-sm text-[#556047] font-semibold">
          {new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Quick CTAs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => navigate("/asistencia")}
          className="field-btn-primary"
          data-testid="dashboard-cta-asistencia"
        >
          <ScanLine className="w-6 h-6" /> Escanear asistencia
        </button>
        <button
          onClick={() => navigate("/registrar")}
          className="field-btn-accent"
          data-testid="dashboard-cta-registrar"
        >
          <Wheat className="w-6 h-6" /> Registrar cosecha
        </button>
        <button
          onClick={() => navigate("/dia")}
          className="field-btn-secondary h-14 text-lg"
          data-testid="dashboard-cta-dia"
        >
          Ver lista del día <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="En campo ahora"
          value={data?.present_now || 0}
          sub="Trabajadores sin salida"
          Icon={UserCheck}
          variant="dark"
          testid="stat-present-now"
        />
        <StatCard
          label="Jornadas cerradas"
          value={data?.closed_today || 0}
          sub="Hoy"
          Icon={Users}
          testid="stat-closed-today"
        />
        <StatCard
          label="Kilos hoy"
          value={formatNumber(data?.today_kilos, 1)}
          sub="Kg cosechados"
          Icon={Wheat}
          testid="stat-today-kilos"
        />
        <StatCard
          label="Pago hoy"
          value={formatCurrency(data?.today_payment)}
          sub="A pagar"
          Icon={DollarSign}
          variant="accent"
          testid="stat-today-payment"
        />
      </div>

      {/* Month summary */}
      <div className="field-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#556047]">Resumen del mes</div>
            <div className="font-mono-stat text-2xl sm:text-3xl mt-1 text-[#1A2210]">
              {formatNumber(data?.month_kilos, 0)} <span className="text-base">Kg</span>
            </div>
            <div className="text-sm font-bold text-[#15803D] mt-0.5">{formatCurrency(data?.month_payment)}</div>
          </div>
          <div className="hidden sm:flex items-center justify-center w-14 h-14 rounded-2xl bg-[#F0EDE1] text-[#1E4620]">
            <TrendingUp className="w-7 h-7" strokeWidth={2.4} />
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-[#E2DDD0] grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-[#556047] font-bold uppercase tracking-wider">Trabajadores</div>
            <div className="font-mono-stat text-xl text-[#1A2210]">{data?.workers_count || 0}</div>
          </div>
          <div>
            <div className="text-xs text-[#556047] font-bold uppercase tracking-wider">Parcelas</div>
            <div className="font-mono-stat text-xl text-[#1A2210]">{data?.parcels_count || 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
