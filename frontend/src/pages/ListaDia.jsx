import { useEffect, useState } from "react";
import { Loader2, Wheat, DollarSign, Users, Calendar, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, formatNumber, todayISO } from "@/lib/api";

export default function ListaDia() {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/harvests/daily", { params: { date } });
      setData(data);
    } catch (e) {
      toast.error("No se pudo cargar la lista del día");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const onDelete = async (id) => {
    if (!window.confirm("¿Eliminar este registro de cosecha?")) return;
    try {
      await api.delete(`/harvests/${id}`);
      toast.success("Registro eliminado");
      load();
    } catch (e) {
      toast.error("No se pudo eliminar");
    }
  };

  return (
    <div className="space-y-5" data-testid="lista-dia-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Lista del día
          </h1>
          <p className="text-sm text-[#556047] font-semibold">Totales y detalle de cosechas</p>
        </div>
        <div>
          <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field-input !h-12 !text-base"
            data-testid="dia-date-input"
          />
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-[#1E4620] text-white p-4 border-2 border-[#153417] shadow-sm" data-testid="daily-total-kilos">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">Total kilos</div>
            <Wheat className="w-5 h-5 opacity-85" />
          </div>
          <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{formatNumber(data?.total_kilos || 0, 2)} <span className="text-base">Kg</span></div>
        </div>
        <div className="rounded-2xl bg-[#E65100] text-white p-4 border-2 border-[#C63D00] shadow-sm" data-testid="daily-total-payment">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">Total a pagar</div>
            <DollarSign className="w-5 h-5 opacity-85" />
          </div>
          <div className="font-mono-stat text-2xl sm:text-3xl mt-1">{formatCurrency(data?.total_payment || 0)}</div>
        </div>
        <div className="rounded-2xl bg-white border-2 border-[#E2DDD0] p-4 shadow-sm col-span-2 lg:col-span-1" data-testid="daily-total-units">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#556047]">Unidades</div>
            <Calendar className="w-5 h-5 text-[#889078]" />
          </div>
          <div className="font-mono-stat text-2xl sm:text-3xl mt-1 text-[#1A2210]">{formatNumber(data?.total_units || 0, 0)}</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-[#1E4620]">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* By worker */}
          <div className="field-card p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-[#1E4620]" />
              <h3 className="text-lg font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
                Resumen por trabajador
              </h3>
            </div>
            {(data?.by_worker || []).length === 0 ? (
              <p className="text-sm text-[#556047] font-semibold py-4 text-center">
                Sin registros para esta fecha
              </p>
            ) : (
              <div className="space-y-2">
                {data.by_worker.map((w) => (
                  <div
                    key={w.worker_id}
                    className="flex items-center justify-between p-3 bg-[#F7F5EE] rounded-xl border border-[#E2DDD0]"
                    data-testid={`worker-summary-${w.worker_id}`}
                  >
                    <div>
                      <div className="font-bold text-[#1A2210]">{w.worker_name}</div>
                      <div className="text-xs text-[#556047] font-semibold">
                        {formatNumber(w.kilos, 2)} Kg • {formatNumber(w.units, 0)} u. • {w.count} registros
                      </div>
                    </div>
                    <div className="font-mono-stat text-lg text-[#15803D]">{formatCurrency(w.payment)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Harvests detail */}
          <div className="field-card p-4 sm:p-5">
            <h3 className="text-lg font-bold text-[#1A2210] mb-3" style={{ fontFamily: "Outfit, sans-serif" }}>
              Detalle de cosechas
            </h3>
            {(data?.harvests || []).length === 0 ? (
              <p className="text-sm text-[#556047] font-semibold py-4 text-center" data-testid="empty-harvests">
                No hay cosechas registradas en esta fecha
              </p>
            ) : (
              <div className="space-y-2">
                {data.harvests.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 bg-white border border-[#E2DDD0] rounded-xl flex items-start justify-between gap-3"
                    data-testid={`harvest-row-${h.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#1A2210]">
                        {h.worker_name} <span className="text-[#889078] font-semibold text-sm">• {h.product_name}</span>
                      </div>
                      <div className="text-xs text-[#556047] font-semibold mt-0.5">
                        {h.parcel_name} • {formatNumber(h.kilos, 2)} Kg • {formatNumber(h.units, 0)} u.
                      </div>
                      {h.notes ? (
                        <div className="text-xs text-[#889078] italic mt-1 truncate">{h.notes}</div>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="font-mono-stat text-base text-[#15803D]">{formatCurrency(h.payment)}</div>
                      <button
                        onClick={() => onDelete(h.id)}
                        className="text-red-600 hover:bg-red-50 w-8 h-8 rounded-lg flex items-center justify-center"
                        data-testid={`harvest-delete-${h.id}`}
                        aria-label="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
