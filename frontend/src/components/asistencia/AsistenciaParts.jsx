import { memo, useEffect, useState } from "react";
import { Loader2, Share2, Trash2, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatHHMM, sessionExportParams } from "@/lib/api";

export const PAGE_SIZE = 30;

export function usePaged(list, deps = []) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLimit(PAGE_SIZE); }, deps);
  return { visible: list.slice(0, limit), remaining: Math.max(0, list.length - limit), more: () => setLimit((l) => l + PAGE_SIZE) };
}

export function ShowMore({ remaining, onClick, testid }) {
  if (!remaining) return null;
  return (
    <button onClick={onClick} className="w-full py-3 rounded-xl bg-white border border-[#E2DDD0] text-[#1D4ED8] font-bold text-sm" data-testid={testid}>
      Ver más ({remaining})
    </button>
  );
}

const fmtElapsed = (mins) => {
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
};

function ElapsedTime({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  return fmtElapsed(Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000)));
}

export const HubRow = memo(function HubRow({ r, shortId, checkoutCode, processing, onCheckout }) {
  const open = !r.check_out && r.check_in;
  const h = Number(r.hours) || 0;
  const done = r.check_out && r.check_in ? fmtElapsed(Math.floor(h) * 60 + Math.round((h % 1) * 60)) : "—";
  return (
    <div className="bg-white border border-[#E2DDD0] rounded-2xl p-3 flex items-center gap-3" data-testid={`hub-row-${r.id}`}>
      <div className="w-10 h-10 rounded-xl bg-[#F0EDE1] flex items-center justify-center text-[#1E2746] font-mono-stat text-sm">{shortId}</div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-[#1A2210] truncate">{r.worker_name}</div>
        <div className="text-[11px] text-[#889078] font-semibold font-mono-stat">
          {formatHHMM(r.check_in) || "—"}{formatHHMM(r.check_out) ? ` → ${formatHHMM(r.check_out)}` : " →"}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] text-[#889078] font-bold uppercase tracking-wider leading-none">{open ? "En campo" : "Jornada"}</div>
        <div className={`font-mono-stat text-base font-extrabold mt-0.5 ${open ? "text-[#1D4ED8]" : "text-[#5A4A98]"}`}>
          {open ? <ElapsedTime since={r.check_in} /> : done}
        </div>
      </div>
      {open ? (
        <button onClick={() => onCheckout(checkoutCode)} disabled={processing} className="h-10 px-3 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold rounded-xl text-xs flex items-center gap-1 shrink-0 disabled:opacity-60" data-testid={`hub-checkout-${r.id}`}>
          Salida
        </button>
      ) : (
        <span className="w-2.5 h-2.5 rounded-full bg-[#5A4A98] shrink-0" />
      )}
    </div>
  );
});

export const AttendanceRow = memo(function AttendanceRow({ r, place, onDelete }) {
  return (
    <div className="bg-white border border-[#E2DDD0] rounded-xl p-3 flex items-start gap-3" data-testid={`attendance-row-${r.id}`}>
      <div className="min-w-[70px]">
        <div className="text-xs text-[#889078] font-semibold uppercase tracking-wider">Hora</div>
        <div className="font-bold text-[#1A2210] text-base">{formatHHMM(r.check_in) || "—"}</div>
        {r.check_out && <div className="text-xs text-red-700 font-bold mt-0.5">↓ {formatHHMM(r.check_out)}</div>}
      </div>
      <div className="min-w-0 flex-1 border-l border-[#E2DDD0] pl-3">
        <div className="text-xs text-[#889078] font-semibold uppercase tracking-wider">Trabajador</div>
        <div className="font-bold text-[#1A2210]">{r.worker_name}</div>
        <div className="text-xs text-[#556047] font-semibold mt-0.5 truncate">{place} — Picking</div>
      </div>
      <button onClick={() => onDelete(r.id)} className="w-8 h-8 rounded-lg hover:bg-red-50 text-red-600 flex items-center justify-center" data-testid={`attendance-delete-${r.id}`}>
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
});

export const ManualWorkerRow = memo(function ManualWorkerRow({ w, selected, setSelected }) {
  const toggle = () => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(w.id)) next.delete(w.id); else next.add(w.id);
    return next;
  });
  return (
    <li>
      <button type="button" onClick={toggle} className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${selected ? "bg-[#EFF6FF]" : "hover:bg-[#F7F5EE]"}`} data-testid={`manual-worker-${w.id}`}>
        <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${selected ? "bg-[#1D4ED8] border-[#1D4ED8]" : "border-[#889078]"}`}>
          {selected ? <CheckCircle2 className="w-3.5 h-3.5 text-white" /> : null}
        </span>
        <span className="font-bold text-sm text-[#1A2210] truncate flex-1">{w.name}</span>
      </button>
    </li>
  );
});

export function Tile({ label, icon, onClick, colorFrom, colorTo, badge, testid }) {
  return (
    <button onClick={onClick} data-testid={testid} className="flex flex-col items-center group">
      <div className="w-full aspect-square rounded-[22px] flex items-center justify-center text-white shadow-lg active:scale-[0.97] transition-transform relative" style={{ background: `linear-gradient(145deg, ${colorFrom}, ${colorTo})` }}>
        {icon}
        {badge ? (
          <span className="absolute -top-1.5 -right-1.5 bg-white text-[#1A2210] font-mono-stat text-xs min-w-[24px] h-6 rounded-full px-1.5 flex items-center justify-center shadow-md border-2 border-white">{badge}</span>
        ) : null}
      </div>
      <div className="mt-2 text-white text-sm font-bold text-center" style={{ fontFamily: "Outfit, sans-serif" }}>{label}</div>
    </button>
  );
}

export function MiniStat({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-[#E2DDD0] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#889078]">{label}</div>
      <div className="font-mono-stat text-xl" style={{ color }}>{value}</div>
    </div>
  );
}

export function SummaryCell({ label, value }) {
  return (
    <div className="bg-[#F7F5EE] border border-[#E2DDD0] rounded-xl px-3 py-2 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#889078]">{label}</div>
      <div className="font-mono-stat text-xl text-[#1A2210]">{value}</div>
    </div>
  );
}

function Stat({ label, value, smallValue = false }) {
  return (
    <div>
      <div className="text-[10px] text-[#556047] font-semibold uppercase tracking-wider">{label}</div>
      <div className={`font-mono-stat text-[#1A2210] mt-1 ${smallValue ? "text-base font-extrabold" : "text-2xl"}`}>{value}</div>
    </div>
  );
}

const formatHours = (h) => {
  if (!h) return "0min";
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return hh > 0 ? `${hh}h ${mm}min` : `${mm}min`;
};
const fmtMoney = (n) => Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const fmtQty = (n) => (n % 1 === 0 ? n : n.toFixed(2));

const SummaryRow = memo(function SummaryRow({ r, agg }) {
  return (
    <div className="bg-white border border-[#E2DDD0] rounded-xl p-4 border-l-4 border-l-[#2563EB]" data-testid={`summary-row-${r.id}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-[#889078] font-bold uppercase tracking-wider">Nombre</div>
          <div className="font-bold text-[#1A2210] text-base truncate">{r.worker_name}</div>
          <div className="text-[11px] text-[#556047] font-semibold font-mono-stat mt-0.5">
            {formatHHMM(r.check_in) || "—"}{formatHHMM(r.check_out) ? ` → ${formatHHMM(r.check_out)}` : " → en campo"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[#889078] font-bold uppercase tracking-wider">Pago</div>
          <div className="font-mono-stat text-base font-extrabold text-[#1D4ED8]">{fmtMoney(agg.payment)}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#F0EDE1]">
        <div>
          <div className="text-[10px] text-[#889078] font-bold uppercase tracking-wider">Horas</div>
          <div className="font-mono-stat text-sm text-[#1A2210] mt-0.5">{formatHours(r.hours)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#889078] font-bold uppercase tracking-wider">Piezas</div>
          <div className="font-mono-stat text-sm text-[#1A2210] mt-0.5">{fmtQty(agg.pieces)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#889078] font-bold uppercase tracking-wider">Kg</div>
          <div className="font-mono-stat text-sm text-[#1A2210] mt-0.5">{agg.kilos ? agg.kilos.toFixed(2) : "—"}</div>
        </div>
      </div>
    </div>
  );
});

const EMPTY_AGG = { pieces: 0, kilos: 0, payment: 0 };

async function shareDaySummary({ text, date }) {
  let blob = null;
  try {
    const resp = await api.get("/receipts/export", {
      params: { date_from: date, date_to: date, tz_offset: -new Date().getTimezoneOffset(), ...sessionExportParams(date) },
      responseType: "blob",
    });
    blob = resp.data;
  } catch (err) {
    console.warn("summary export", err);
  }
  const filename = `resumen_${date}.xlsx`;
  if (blob && navigator.canShare) {
    const file = new File([blob], filename, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: "Resumen de jornada", text, files: [file] });
        toast.success("Resumen compartido");
        return;
      } catch (err) { if (err?.name === "AbortError") return; }
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: "Resumen de jornada", text });
      toast.success("Resumen compartido (texto). Descarga el Excel para adjuntarlo también.");
      return;
    } catch (err) { if (err?.name === "AbortError") return; }
  }
  if (blob) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  }
  try { await navigator.clipboard.writeText(text); toast.success("Excel descargado y resumen copiado"); }
  catch (_) { toast.error("No se pudo compartir"); }
}

export function SummaryView({ data, selectedParcel, harvestsToday = [], date, onClose }) {
  const byWorker = {};
  harvestsToday.forEach((h) => {
    const id = h.worker_id;
    if (!byWorker[id]) byWorker[id] = { pieces: 0, kilos: 0, payment: 0 };
    byWorker[id].pieces += Number(h.units || 0);
    byWorker[id].kilos += Number(h.kilos || 0);
    byWorker[id].payment += Number(h.payment || 0);
  });
  const loc = selectedParcel?.name || "Sin ubicación";
  const totalWorkers = data.rows.length;
  const totalPieces = Object.values(byWorker).reduce((a, b) => a + b.pieces, 0);
  const totalKilos = Object.values(byWorker).reduce((a, b) => a + b.kilos, 0);
  const totalPayment = Object.values(byWorker).reduce((a, b) => a + b.payment, 0);
  const totalHoursAll = data.rows.reduce((a, b) => a + (Number(b.hours) || 0), 0);
  const { visible, remaining, more } = usePaged(data.rows, [data.rows.length]);

  const [sharing, setSharing] = useState(false);
  const shareSummary = async () => {
    if (data.rows.length === 0) { toast.error("Sin trabajadores para compartir"); return; }
    setSharing(true);
    const text = [
      "📋 AgriScan — Resumen de jornada",
      `${date} · ${loc}`,
      `👥 ${totalWorkers} trabajadores · ⏱  ${formatHours(totalHoursAll)}`,
      `🧺 ${totalPieces.toFixed(2)} piezas · ⚖️ ${totalKilos.toFixed(2)}Kg`,
      `💵 Total: ${fmtMoney(totalPayment)}`,
    ].join("\n");
    try { await shareDaySummary({ text, date }); } finally { setSharing(false); }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] -mx-4 -my-5 sm:-mx-0 sm:-my-0" data-testid="crew-summary-view">
      <div className="bg-[#1e40af] text-white px-5 pt-5 pb-6 rounded-b-xl">
        <div className="flex items-center justify-between mb-5">
          <button onClick={onClose} className="flex items-center gap-1" data-testid="close-summary"><X className="w-6 h-6" /></button>
          <h2 className="text-xl font-extrabold flex-1 pl-2" style={{ fontFamily: "Outfit, sans-serif" }}>Resumen</h2>
          <button onClick={shareSummary} disabled={sharing} className="bg-white text-[#1e40af] px-4 h-9 rounded-full text-sm font-bold flex items-center gap-1.5 disabled:opacity-60" data-testid="summary-share-button">
            {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Compartir
          </button>
        </div>
      </div>

      <div className="px-4 pt-5">
        <div className="grid grid-cols-4 gap-3 pb-5 border-b border-[#E2DDD0]">
          <Stat label="Trabajadores" value={totalWorkers} />
          <Stat label="Horas" value={formatHours(totalHoursAll)} smallValue />
          <Stat label="Piezas" value={fmtQty(totalPieces)} />
          <Stat label="Pago" value={fmtMoney(totalPayment)} smallValue />
        </div>
        <div className="py-3 text-sm text-[#556047] font-semibold">
          Agrupado por: <span className="text-[#1e40af] font-bold border-b-2 border-[#1e40af]">Ubicación</span>
        </div>
        {data.rows.length > 0 && (
          <div className="mt-2">
            <div className="text-sm font-bold text-[#1A2210] py-2" style={{ fontFamily: "Outfit, sans-serif" }}>{loc} ({data.rows.length})</div>
            <div className="space-y-2 pb-6">
              {visible.map((r) => <SummaryRow key={r.id} r={r} agg={byWorker[r.worker_id] || EMPTY_AGG} />)}
              <ShowMore remaining={remaining} onClick={more} testid="summary-show-more" />
            </div>
          </div>
        )}
        {data.rows.length === 0 && <p className="text-center text-[#556047] font-semibold py-8">Sin registros</p>}
      </div>
    </div>
  );
}
