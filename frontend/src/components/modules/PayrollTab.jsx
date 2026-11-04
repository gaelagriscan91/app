import { useEffect, useState } from "react";
import { Loader2, Share2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, todayISO } from "@/lib/api";

const mondayOf = (iso) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const shiftWeek = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 7 * n);
  return d.toISOString().slice(0, 10);
};
const short = (iso) => { const [y, m, d] = iso.split("-"); return `${m}-${d}-${y.slice(2)}`; };
const qty = (n) => (n % 1 === 0 ? n : n.toFixed(2));

async function shareBlob(blob, filename, text) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ title: "Payroll", text, files: [file] }); return; }
    catch (e) { if (e?.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast.success("Payroll descargado");
}

export default function PayrollTab() {
  const [week, setWeek] = useState(mondayOf(todayISO()));
  const [grower, setGrower] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/payroll", { params: { week, grower } })
      .then(({ data }) => setData(data))
      .catch(() => toast.error("No se pudo cargar el payroll"))
      .finally(() => setLoading(false));
  }, [week, grower]);

  const share = async () => {
    if (!data?.rows.length) { toast.error("No hay datos esta semana"); return; }
    setSharing(true);
    try {
      const resp = await api.get("/payroll/export", { params: { week, grower }, responseType: "blob" });
      await shareBlob(resp.data, `payroll_${week}${grower ? "_" + grower.replace(/\s+/g, "_") : ""}.xlsx`,
        `Payroll ${short(data.week_start)} a ${short(data.week_end)} · ${grower || "Todos"} · Total ${formatCurrency(data.total)}`);
    } catch (_) {
      toast.error("No se pudo compartir");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="payroll-tab">
      <div className="field-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setWeek(shiftWeek(week, -1))} className="w-10 h-10 rounded-xl bg-[#F0EDE1] flex items-center justify-center" data-testid="payroll-prev-week"><ChevronLeft className="w-5 h-5" /></button>
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#889078]">Semana (lunes a domingo)</div>
            <div className="font-extrabold text-[#1A2210]" data-testid="payroll-week-label">{data ? `${short(data.week_start)} → ${short(data.week_end)}` : "…"}</div>
          </div>
          <button onClick={() => setWeek(shiftWeek(week, 1))} className="w-10 h-10 rounded-xl bg-[#F0EDE1] flex items-center justify-center" data-testid="payroll-next-week"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="flex gap-2">
          <select value={grower} onChange={(e) => setGrower(e.target.value)} className="flex-1 h-11 rounded-xl border border-[#E2DDD0] bg-white px-3 font-bold text-sm" data-testid="payroll-grower-select">
            <option value="">Todos los growers</option>
            {grower && !(data?.growers || []).includes(grower) && <option value={grower}>{grower}</option>}
            {(data?.growers || []).map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <button onClick={share} disabled={sharing || loading} className="h-11 px-4 rounded-xl bg-[#1D4ED8] text-white font-bold text-sm flex items-center gap-2 disabled:opacity-60" data-testid="payroll-share-button">
            {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Compartir
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8]" /></div>
      ) : !data?.rows.length ? (
        <div className="field-card p-8 text-center text-sm text-[#556047] font-semibold" data-testid="payroll-empty">No hay recibos en esta semana</div>
      ) : (
        <div className="field-card p-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3 text-sm">
            <div><b>Grower:</b> <span data-testid="payroll-grower">{data.grower || "Todos"}</span></div>
            <div><b>Mayordomo:</b> <span data-testid="payroll-mayordomo">{data.mayordomo || "—"}</span></div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs border-separate border-spacing-0 min-w-[900px] w-full" data-testid="payroll-table">
              <thead className="bg-[#C9C9C9] text-[#111]">
                <tr>
                  <th className="border border-[#aaa] p-1.5 sticky left-0 bg-[#C9C9C9] z-10" />
                  {data.days.map((d) => <th key={d.date} colSpan={2} className="border border-[#aaa] p-1.5">{d.name}</th>)}
                  <th rowSpan={3} className="border border-[#aaa] p-1.5">$</th>
                </tr>
                <tr>
                  <th className="border border-[#aaa] p-1.5 text-right sticky left-0 bg-[#C9C9C9] z-10">Fecha</th>
                  {data.days.map((d) => <th key={d.date} colSpan={2} className="border border-[#aaa] p-1.5">{short(d.date)}</th>)}
                </tr>
                <tr>
                  <th className="border border-[#aaa] p-1.5 text-left sticky left-0 bg-[#C9C9C9] z-10">Nombre Empleados</th>
                  {data.days.map((d) => [
                    <th key={d.date + "p"} className="border border-[#aaa] p-1.5 text-left">Pieza</th>,
                    <th key={d.date + "$"} className="border border-[#aaa] p-1.5 text-left">Precio {d.price ? formatCurrency(d.price) : ""}</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.worker_name} className="bg-white" data-testid={`payroll-row-${r.worker_name}`}>
                    <td className="border border-[#ccc] p-1.5 font-semibold sticky left-0 bg-white z-10 max-w-[120px] break-words">{r.worker_name}</td>
                    {r.days.map((c, i) => [
                      <td key={i + "u"} className="border border-[#ccc] p-1.5 text-right">{c.units ? qty(c.units) : ""}</td>,
                      <td key={i + "$"} className="border border-[#ccc] p-1.5 text-right">{c.units ? formatCurrency(c.payment) : ""}</td>,
                    ])}
                    <td className="border border-[#ccc] p-1.5 text-right font-bold">{formatCurrency(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-right mt-3 font-extrabold text-[#1A2210]" data-testid="payroll-total">Total: {formatCurrency(data.total)}</div>
        </div>
      )}
    </div>
  );
}
