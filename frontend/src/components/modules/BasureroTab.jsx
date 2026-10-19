import { useEffect, useState } from "react";
import { Loader2, Trash2, Calendar, Users, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";

const DAYS = 60;
const fmt = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return isNaN(d) ? iso : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};
const daysLeft = (iso) => Math.max(0, DAYS - Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

export default function BasureroTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.get("/receipts/trash")
      .then(({ data }) => setRows(data || []))
      .catch(() => toast.error("No se pudo cargar el basurero"))
      .finally(() => setLoading(false));
  }, []);

  const act = async (r, kind) => {
    if (kind === "purge" && !(await confirmAction("¿Borrar este recibo para siempre? No se podrá recuperar.", "Borrar"))) return;
    setBusy(r.id);
    try {
      if (kind === "restore") await api.post(`/receipts/trash/${r.id}/restore`);
      else await api.delete(`/receipts/trash/${r.id}`);
      setRows((list) => list.filter((x) => x.id !== r.id));
      toast.success(kind === "restore" ? "Recibo recuperado en Registro" : "Recibo borrado para siempre");
    } catch (_) {
      toast.error("No se pudo completar");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8]" /></div>;

  return (
    <div className="space-y-3" data-testid="basurero-tab">
      <div className="field-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Trash2 className="w-5 h-5 text-[#DC2626]" />
          <h3 className="font-extrabold text-[#1A2210]">Basurero</h3>
        </div>
        <p className="text-xs text-[#556047] font-semibold">Recibos borrados. Puedes recuperarlos; se borran solos después de {DAYS} días.</p>
      </div>
      {rows.length === 0 ? (
        <div className="field-card p-8 text-center text-sm text-[#556047] font-semibold" data-testid="basurero-empty">El basurero está vacío</div>
      ) : rows.map((r) => (
        <div key={r.id} className="field-card p-4 flex items-center gap-3" data-testid={`basurero-item-${r.id}`}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-[#556047] font-bold"><Calendar className="w-3.5 h-3.5" /> {fmt(r.date_from)} → {fmt(r.date_to)}</div>
            <div className="font-mono-stat text-base text-[#1A2210] font-extrabold mt-1">{formatCurrency(r.total_payment)}</div>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-[#889078] font-semibold">
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {r.workers_count}</span>
              <span>Borrado {fmt(r.deleted_at)} · quedan {daysLeft(r.deleted_at)} días</span>
            </div>
          </div>
          <button onClick={() => act(r, "restore")} disabled={busy === r.id} className="h-10 px-3 rounded-xl bg-[#1D4ED8] text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50" data-testid={`basurero-restore-${r.id}`}>
            <RotateCcw className="w-4 h-4" /> Recuperar
          </button>
          <button onClick={() => act(r, "purge")} disabled={busy === r.id} className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center disabled:opacity-50" data-testid={`basurero-purge-${r.id}`}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
