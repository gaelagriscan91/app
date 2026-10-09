import { useEffect, useMemo, useState } from "react";
import { Loader2, Calendar, Users, Clock, FileText, ChevronDown, Shield, UserCog } from "lucide-react";
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

export default function MayordomoReceiptsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/receipts/history");
        setRows(data || []);
      } catch (_) {
        toast.error("No se pudieron cargar los recibos de mayordomos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group own receipts by who saved them
  const grouped = useMemo(() => {
    const map = {};
    for (const r of rows) {
      const role = r.saved_by_role || "admin";
      const name = r.saved_by_name || "Sin usuario";
      const key = `${role}::${name}`;
      if (!map[key]) map[key] = { key, name, role, receipts: [], total: 0, totalHours: 0, totalWorkers: 0 };
      map[key].receipts.push(r);
      map[key].total += Number(r.total_payment || 0);
      map[key].totalHours += Number(r.total_hours || 0);
      map[key].totalWorkers += Number(r.workers_count || 0);
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#1D4ED8]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="mayordomo-receipts-tab">
      <div className="field-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <UserCog className="w-5 h-5 text-[#1D4ED8]" />
          <h3 className="font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
            Recibos por mayordomo
          </h3>
        </div>
        <p className="text-xs text-[#556047] font-semibold">
          Recibos guardados por cada mayordomo que usa el app. Toca un nombre para ver sus recibos.
        </p>
      </div>

      {grouped.length === 0 ? (
        <div className="field-card p-8 text-center">
          <FileText className="w-10 h-10 mx-auto text-[#889078] mb-2" />
          <p className="text-sm text-[#556047] font-semibold">
            Aún no hay recibos guardados por mayordomos.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map((g) => {
            const open = expanded === g.key;
            const isAdmin = g.role === "admin";
            return (
              <div key={g.key} className="field-card overflow-hidden" data-testid={`mayordomo-group-${g.key}`}>
                <button
                  onClick={() => setExpanded(open ? null : g.key)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-[#F7F5EE]/50 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isAdmin ? (
                        <Shield className="w-4 h-4 text-[#1D4ED8] shrink-0" />
                      ) : (
                        <UserCog className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      <span className="font-extrabold text-[#1A2210] truncate">{g.name}</span>
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${
                        isAdmin ? "bg-[#EFF6FF] text-[#1D4ED8]" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        MAYORDOMO
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-[#889078] font-semibold flex-wrap">
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {g.receipts.length} recibo{g.receipts.length !== 1 ? "s" : ""}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {g.totalWorkers}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatNumber(g.totalHours, 2)}h</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <div className="font-mono-stat text-base text-[#1D4ED8] font-extrabold">{formatCurrency(g.total)}</div>
                    <ChevronDown className={`w-4 h-4 text-[#889078] transition-transform ${open ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {open && (
                  <div className="border-t border-[#E2DDD0] bg-[#F7F5EE]/40 p-3 space-y-2" data-testid={`mayordomo-receipts-${g.key}`}>
                    {g.receipts.map((r) => (
                      <div
                        key={r.id}
                        className="bg-white border border-[#E2DDD0] rounded-xl p-3"
                        data-testid={`mayordomo-receipt-${r.id}`}
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
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
