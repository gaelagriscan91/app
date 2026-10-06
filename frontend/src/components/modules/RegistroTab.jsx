import { useEffect, useState } from "react";
import { Loader2, Trash2, Calendar, Users, Clock, DollarSign, FileText, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, formatNumber } from "@/lib/api";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch (_) { return iso; }
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (_) { return iso; }
}

export default function RegistroTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/receipts/history");
      setRows(data || []);
    } catch (_) {
      toast.error("No se pudo cargar el registro");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/receipts/history/${id}`);
      setSelected(data);
    } catch (_) {
      toast.error("No se pudo cargar el detalle");
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteOne = async (id) => {
    if (!window.confirm("¿Eliminar este recibo guardado?")) return;
    try {
      await api.delete(`/receipts/history/${id}`);
      toast.success("Recibo eliminado");
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (_) {
      toast.error("No se pudo eliminar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#1D4ED8]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="registro-tab">
      <div className="field-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-5 h-5 text-[#1D4ED8]" />
          <h3 className="font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
            Recibos guardados
          </h3>
        </div>
        <p className="text-xs text-[#556047] font-semibold">
          Historial de recibos que guardaste desde Reportes. Útil para consulta y auditoría.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="field-card p-8 text-center">
          <FileText className="w-10 h-10 mx-auto text-[#889078] mb-2" />
          <p className="text-sm text-[#556047] font-semibold">
            Aún no hay recibos guardados.<br />
            Ve a <b>Reportes</b> → Generar recibos → <b>Guardar recibo</b>.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => openDetail(r.id)}
              className="w-full text-left field-card p-4 hover:border-[#1D4ED8] transition-all"
              data-testid={`registro-item-${r.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-[#556047] font-bold">
                    <Calendar className="w-3.5 h-3.5" />
                    {fmtDate(r.date_from)} → {fmtDate(r.date_to)}
                  </div>
                  <div className="font-mono-stat text-base text-[#1A2210] font-extrabold mt-1">
                    {formatCurrency(r.total_payment)}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-[#889078] font-semibold flex-wrap">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {r.workers_count}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatNumber(r.total_hours, 2)}h</span>
                    <span>{fmtDateTime(r.saved_at)}</span>
                  </div>
                  {r.saved_by_name && (
                    <div className="mt-1 inline-flex items-center gap-1 bg-[#EFF6FF] text-[#1D4ED8] px-2 py-0.5 rounded-full text-[10px] font-extrabold">
                      {r.saved_by_role === "admin" ? "ADMIN" : "MAYORDOMO"} · {r.saved_by_name}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteOne(r.id); }}
                    className="w-9 h-9 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center"
                    data-testid={`registro-delete-${r.id}`}
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-5 h-5 text-[#889078]" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-5 w-full sm:max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="registro-detail-modal">
            {detailLoading || !selected ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8]" /></div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-extrabold text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>
                    Recibo guardado
                  </h3>
                  <button onClick={() => setSelected(null)} className="w-9 h-9 rounded-full bg-[#F0EDE1] flex items-center justify-center" data-testid="registro-detail-close">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {/* Rancho / Trabajo / Fecha */}
                <div className="bg-[#EFF6FF] border border-[#DBEAFE] rounded-xl p-3 mb-3 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#556047] w-16 pt-0.5">Rancho</div>
                    <div className="text-sm font-bold text-[#1A2210] flex-1">
                      {(selected.parcels && selected.parcels.length > 0) ? selected.parcels.join(", ") : "—"}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#556047] w-16 pt-0.5">Trabajo</div>
                    <div className="text-sm font-bold text-[#1A2210] flex-1">
                      {(selected.products && selected.products.length > 0) ? selected.products.join(", ") : "—"}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#556047] w-16 pt-0.5">Fecha</div>
                    <div className="text-sm font-bold text-[#1A2210] flex-1">
                      {fmtDate(selected.date_from)} → {fmtDate(selected.date_to)}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-[#889078] font-semibold mb-3">
                  Guardado {fmtDateTime(selected.saved_at)}{selected.saved_by_name ? ` · por ${selected.saved_by_name}` : ""}
                </div>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div className="rounded-xl bg-[#1D4ED8] text-white p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider opacity-90">Horas</div>
                    <div className="font-mono-stat text-base mt-0.5">{formatNumber(selected.total_hours, 2)}</div>
                  </div>
                  <div className="rounded-xl bg-white border-2 border-[#E2DDD0] p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[#556047]">Trab.</div>
                    <div className="font-mono-stat text-base mt-0.5 text-[#1A2210]">{selected.workers_count}</div>
                  </div>
                  <div className="rounded-xl bg-white border-2 border-[#E2DDD0] p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[#556047]">Piezas</div>
                    <div className="font-mono-stat text-base mt-0.5 text-[#1A2210]">
                      {Math.round(selected.total_units || 0)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#DC2626] text-white p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider opacity-90">Nómina</div>
                    <div className="font-mono-stat text-xs mt-0.5 break-words">{formatCurrency(selected.total_payment)}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {(selected.rows || []).map((r) => {
                    const harvests = r.harvests || [];
                    const parcels = [...new Set(harvests.map((h) => h.parcel_name).filter((x) => x && x !== "—"))];
                    const products = [...new Set(harvests.map((h) => h.product_name).filter((x) => x && x !== "—"))];
                    const prices = [...new Set(harvests.map((h) => h.price_per_unit).filter((x) => x > 0))];
                    const priceLabel = prices.length === 0 ? "—" : prices.length === 1 ? formatCurrency(prices[0]) : "Varios";
                    const dates = harvests.map((h) => h.date).filter(Boolean).sort();
                    const dateLabel = dates.length === 0
                      ? `${fmtDate(selected.date_from)} → ${fmtDate(selected.date_to)}`
                      : dates[0] === dates[dates.length - 1]
                        ? fmtDate(dates[0])
                        : `${fmtDate(dates[0])} → ${fmtDate(dates[dates.length - 1])}`;
                    return (
                      <div key={r.worker_id} className="field-card p-3" data-testid={`registro-detail-row-${r.worker_id}`}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="font-bold text-[#1A2210] truncate">{r.worker_name}</div>
                          <div className="font-mono-stat font-extrabold text-[#1D4ED8]">
                            {formatCurrency(r.total_payment)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <div><span className="text-[#889078] font-bold uppercase tracking-wider">Rancho:</span> <span className="text-[#1A2210] font-bold">{parcels.join(", ") || "—"}</span></div>
                          <div><span className="text-[#889078] font-bold uppercase tracking-wider">Trabajo:</span> <span className="text-[#1A2210] font-bold">{products.join(", ") || "—"}</span></div>
                          <div><span className="text-[#889078] font-bold uppercase tracking-wider">Precio/canasta:</span> <span className="text-[#1A2210] font-bold font-mono-stat">{priceLabel}</span></div>
                          <div><span className="text-[#889078] font-bold uppercase tracking-wider">Canastas:</span> <span className="text-[#1A2210] font-bold font-mono-stat">{Math.round(r.total_units || 0)}</span></div>
                          <div className="col-span-2"><span className="text-[#889078] font-bold uppercase tracking-wider">Fecha:</span> <span className="text-[#1A2210] font-bold">{dateLabel}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
