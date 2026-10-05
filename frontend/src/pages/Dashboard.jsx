import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wheat, Users, DollarSign, TrendingUp, Loader2, ArrowRight, ScanLine, UserCheck } from "lucide-react";
import api, { formatCurrency, formatNumber } from "@/lib/api";

function StatCard({ label, value, sub, Icon, variant = "light", testid }) {
  const base = "rounded-2xl p-4 sm:p-5 border-2 shadow-sm transition-transform hover:-translate-y-0.5";
  const styles =
    variant === "dark"
      ? "bg-[#1D4ED8] border-[#1E3A8A] text-white"
      : variant === "accent"
      ? "bg-[#DC2626] border-[#B91C1C] text-white"
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
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${variant === "light" ? "bg-[#F0EDE1] text-[#1D4ED8]" : "bg-white/15 text-white"}`}>
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
      <div className="flex items-center justify-center py-20 text-[#1D4ED8]">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => navigate("/registrar?mode=qr")}
          className="field-btn-primary"
          data-testid="dashboard-cta-scan-harvest"
        >
          <ScanLine className="w-6 h-6" /> Cosechar por QR
        </button>
        <button
          onClick={() => navigate("/asistencia")}
          className="field-btn-secondary h-14 text-lg"
          data-testid="dashboard-cta-asistencia"
        >
          <UserCheck className="w-5 h-5" /> Asistencia
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        <StatCard
          label="Pago hoy"
          value={formatCurrency(data?.today_payment)}
          sub="A pagar"
          Icon={DollarSign}
          variant="accent"
          testid="stat-today-payment"
        />
      </div>

      {/* Month records list */}
      <div className="field-card p-0 overflow-hidden" data-testid="dashboard-month-records">
        <div className="px-5 py-4 border-b border-[#E2DDD0] flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#556047]">Registros del mes</div>
            <div className="text-sm font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
              {data?.month_records_count || 0} cosechas
            </div>
          </div>
          <button
            onClick={() => navigate("/reportes")}
            className="h-9 px-3 rounded-xl bg-[#F0EDE1] hover:bg-[#E2DDD0] text-[#556047] font-bold text-xs flex items-center gap-1"
            data-testid="dashboard-see-all-reports"
          >
            Ver reportes <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {(!data?.month_records || data.month_records.length === 0) ? (
          <div className="px-5 py-8 text-center text-sm text-[#556047] font-semibold">
            Sin registros este mes aún.
          </div>
        ) : (
          <ul className="divide-y divide-[#E2DDD0] max-h-[480px] overflow-y-auto">
            {data.month_records.map((r) => (
              <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3" data-testid={`dashboard-record-${r.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#1A2210] truncate flex items-center gap-1.5">
                    {r.worker_name || "—"}
                    <span className="text-[10px] font-bold text-[#556047]">·</span>
                    <span className="text-[11px] font-semibold text-[#556047] truncate">{r.product_name || r.parcel_name || ""}</span>
                  </div>
                  <div className="text-[11px] text-[#556047] font-semibold font-mono-stat">
                    {r.date} · {r.kilos ? `${formatNumber(r.kilos, 2)}Kg` : ""} {r.units ? `${formatNumber(r.units, r.units % 1 === 0 ? 0 : 2)}u` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono-stat text-base font-extrabold text-[#1D4ED8]">
                    {formatCurrency(r.payment)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
