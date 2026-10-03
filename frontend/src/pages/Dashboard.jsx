import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wheat, Users, Map, DollarSign, TrendingUp, Loader2, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

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

  const weekly = (data?.weekly || []).map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("es-MX", { weekday: "short" }),
  }));

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          label="Kilos hoy"
          value={formatNumber(data?.today_kilos, 1)}
          sub="Kg cosechados"
          Icon={Wheat}
          variant="dark"
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
        <StatCard
          label="Kilos del mes"
          value={formatNumber(data?.month_kilos, 0)}
          sub={formatCurrency(data?.month_payment)}
          Icon={TrendingUp}
          testid="stat-month-kilos"
        />
        <StatCard
          label="Equipo"
          value={`${data?.workers_count || 0} / ${data?.parcels_count || 0}`}
          sub="Trabajadores / Parcelas"
          Icon={Users}
          testid="stat-team"
        />
      </div>

      {/* Weekly chart */}
      <div className="field-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
              Rendimiento semanal
            </h3>
            <p className="text-xs text-[#556047] font-semibold">Kilos cosechados los últimos 7 días</p>
          </div>
          <Map className="w-5 h-5 text-[#889078]" />
        </div>
        <div className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD0" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#556047", fontWeight: 600, fontSize: 12 }} axisLine={{ stroke: "#D4CEB8" }} />
              <YAxis tick={{ fill: "#556047", fontWeight: 600, fontSize: 12 }} axisLine={{ stroke: "#D4CEB8" }} />
              <Tooltip
                contentStyle={{
                  background: "#1E4620",
                  border: "none",
                  borderRadius: 12,
                  color: "#fff",
                  fontWeight: 700,
                }}
                labelStyle={{ color: "#fff" }}
                formatter={(v) => [`${formatNumber(v, 1)} Kg`, "Kilos"]}
              />
              <Bar dataKey="kilos" fill="#1E4620" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
