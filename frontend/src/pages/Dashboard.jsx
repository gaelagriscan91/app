import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, ScanLine, UserCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, formatNumber } from "@/lib/api";

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/dashboard");
      setData(data);
    } catch (e) {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const deleteHarvest = async (id, workerName) => {
    if (!window.confirm(`¿Borrar las piezas de ${workerName}?`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/harvests/${id}`);
      toast.success("Piezas eliminadas");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo eliminar");
    } finally {
      setDeletingId("");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#1D4ED8]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard-page">
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
              <li key={r.id} className={`px-5 py-3 flex items-center justify-between gap-3 ${r.pending ? "bg-amber-50/60" : ""}`} data-testid={`dashboard-record-${r.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#1A2210] truncate flex items-center gap-1.5 flex-wrap">
                    {r.worker_name || "—"}
                    {r.pending ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                        En campo · 0 piezas
                      </span>
                    ) : (
                      <>
                        <span className="text-[10px] font-bold text-[#556047]">·</span>
                        <span className="text-[11px] font-semibold text-[#556047] truncate">{r.product_name || r.parcel_name || ""}</span>
                      </>
                    )}
                  </div>
                  <div className="text-[11px] text-[#556047] font-semibold font-mono-stat">
                    {r.date}{!r.pending ? ` · ${r.kilos ? `${formatNumber(r.kilos, 2)}Kg` : ""} ${r.units ? `${formatNumber(r.units, r.units % 1 === 0 ? 0 : 2)}u` : ""}` : " · Esperando primera cosecha"}
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div className={`font-mono-stat text-base font-extrabold ${r.pending ? "text-[#889078]" : "text-[#1D4ED8]"}`}>
                    {r.pending ? "—" : formatCurrency(r.payment)}
                  </div>
                  {!r.pending && (
                    <button
                      onClick={() => deleteHarvest(r.id, r.worker_name)}
                      disabled={deletingId === r.id}
                      className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center disabled:opacity-50"
                      data-testid={`dashboard-record-delete-${r.id}`}
                      title="Borrar piezas"
                    >
                      {deletingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
