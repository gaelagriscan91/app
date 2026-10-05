import { useEffect, useMemo, useState } from "react";
import { Download, Filter, Loader2, Wheat, DollarSign, FileText, FileSpreadsheet, Share2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import api, { API, formatCurrency, formatNumber } from "@/lib/api";
import RecibosTab from "@/components/RecibosTab";

function startOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Reportes() {
  const [tab, setTab] = useState("cosechas");
  const [dateFrom, setDateFrom] = useState(startOfMonthISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [workerId, setWorkerId] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [productId, setProductId] = useState("");

  const [workers, setWorkers] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetIncludeAttendance, setResetIncludeAttendance] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [w, p, pr] = await Promise.all([
          api.get("/workers"),
          api.get("/parcels"),
          api.get("/products"),
        ]);
        setWorkers(w.data);
        setParcels(p.data);
        setProducts(pr.data);
      } catch (_) {}
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/harvests", {
        params: {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          worker_id: workerId || undefined,
          parcel_id: parcelId || undefined,
          product_id: productId || undefined,
        },
      });
      setRows(data);
    } catch (e) {
      toast.error("No se pudo cargar el reporte");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.kilos += Number(r.kilos || 0);
        acc.units += Number(r.units || 0);
        acc.payment += Number(r.payment || 0);
        return acc;
      },
      { kilos: 0, units: 0, payment: 0 }
    );
  }, [rows]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const resp = await api.get("/harvests/export", {
        params: {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          worker_id: workerId || undefined,
          parcel_id: parcelId || undefined,
          product_id: productId || undefined,
        },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte_cosechas_${todayISO()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Reporte Excel descargado");
    } catch (e) {
      toast.error("No se pudo exportar");
    } finally {
      setExporting(false);
    }
  };

  const buildShareSummary = () => {
    const lines = [
      "📋 AgriScan — Reporte de cosechas",
      `Periodo: ${dateFrom || "—"} → ${dateTo || "—"}`,
      "",
      `🌾 Kilos: ${formatNumber(totals.kilos, 2)}`,
      `📦 Unidades: ${formatNumber(totals.units, 0)}`,
      `💵 Total a pagar: ${formatCurrency(totals.payment)}`,
      "",
    ];
    const topRows = rows.slice(0, 20);
    topRows.forEach((r) => {
      lines.push(`• ${r.date} ${r.worker_name} — ${formatNumber(r.units, 0)} u. — ${formatCurrency(r.payment)}`);
    });
    if (rows.length > topRows.length) {
      lines.push(`…y ${rows.length - topRows.length} registros más (ver Excel adjunto).`);
    }
    return lines.join("\n");
  };

  const shareReport = async () => {
    if (rows.length === 0) {
      toast.error("No hay datos para compartir");
      return;
    }
    setSharing(true);
    try {
      // 1) Download the Excel blob first
      const resp = await api.get("/harvests/export", {
        params: {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          worker_id: workerId || undefined,
          parcel_id: parcelId || undefined,
          product_id: productId || undefined,
        },
        responseType: "blob",
      });
      const filename = `reporte_cosechas_${todayISO()}.xlsx`;
      const file = new File([resp.data], filename, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const summary = buildShareSummary();

      // 2) Try native Web Share API with the file (iOS/Android share sheet → WhatsApp, Gmail, Mensajes, Telegram…)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: "Reporte de cosechas",
            text: summary,
            files: [file],
          });
          toast.success("Reporte compartido");
          return;
        } catch (err) {
          if (err?.name === "AbortError") return; // user cancelled
          // fall through to text-only share
        }
      }

      // 3) Fallback: share only the text summary (no attachment)
      if (navigator.share) {
        try {
          await navigator.share({ title: "Reporte de cosechas", text: summary });
          toast.success("Resumen compartido (sin archivo). Descarga el Excel para enviarlo también.");
          return;
        } catch (err) {
          if (err?.name === "AbortError") return;
        }
      }

      // 4) Last fallback: copy summary to clipboard + download the Excel
      try {
        await navigator.clipboard.writeText(summary);
        toast.success("Resumen copiado al portapapeles. También descargamos el Excel.");
      } catch (_) {
        toast.success("Reporte descargado. Adjúntalo manualmente al mensaje o correo.");
      }
      const url = window.URL.createObjectURL(resp.data);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("No se pudo compartir el reporte");
    } finally {
      setSharing(false);
    }
  };

  const resetAll = async () => {
    if (resetConfirm.trim().toUpperCase() !== "BORRAR") {
      toast.error('Escribe "BORRAR" para confirmar');
      return;
    }
    setResetting(true);
    try {
      const { data } = await api.post("/harvests/reset", null, {
        params: { include_attendance: resetIncludeAttendance },
      });
      // Clear local scan logs for all days
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("agriscan.scanlog.") || k.startsWith("agriscan.session."))) {
            localStorage.removeItem(k);
          }
        }
      } catch (_) {}
      toast.success(`Historial borrado: ${data.harvests_deleted} cosechas${resetIncludeAttendance ? ` y ${data.attendance_deleted} asistencias` : ""}`);
      setShowReset(false);
      setResetConfirm("");
      setRows([]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "No se pudo borrar el historial");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="reportes-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
          Reportes
        </h1>
        <p className="text-sm text-[#556047] font-semibold">Cosechas, recibos y exportación</p>
      </div>

      {/* Tabs */}
      <div className="field-card p-1.5 flex gap-1.5">
        <button
          onClick={() => setTab("cosechas")}
          data-testid="tab-cosechas"
          className={`flex-1 flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-bold text-sm transition-all ${
            tab === "cosechas"
              ? "bg-[#1E4620] text-white shadow-md"
              : "text-[#556047] hover:bg-[#F0EDE1]"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Cosechas
        </button>
        <button
          onClick={() => setTab("recibos")}
          data-testid="tab-recibos"
          className={`flex-1 flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-bold text-sm transition-all ${
            tab === "recibos"
              ? "bg-[#1E4620] text-white shadow-md"
              : "text-[#556047] hover:bg-[#F0EDE1]"
          }`}
        >
          <FileText className="w-4 h-4" />
          Recibos
        </button>
      </div>

      {tab === "recibos" ? <RecibosTab /> : (
      <>
      {/* Danger zone — reset history (admin only) */}
      <div className="field-card p-4 border-2 border-red-200 bg-red-50/60">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-red-900 text-sm" style={{ fontFamily: "Outfit, sans-serif" }}>
              Empezar temporada nueva
            </h3>
            <p className="text-xs text-red-800/80 font-semibold mt-0.5">
              Borra TODO el historial (cosechas y asistencias) para volver a usar la app desde cero.
            </p>
          </div>
          <button
            onClick={() => setShowReset(true)}
            className="h-10 px-3 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl flex items-center gap-1.5 shadow-sm"
            data-testid="open-reset-modal"
          >
            <Trash2 className="w-4 h-4" /> Borrar todo
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="field-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-[#1E4620]" />
          <h3 className="text-base font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
            Filtros
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="field-input !h-12 !text-base" data-testid="filter-date-from" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="field-input !h-12 !text-base" data-testid="filter-date-to" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Trabajador</label>
            <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="field-input !h-12 !text-base" data-testid="filter-worker">
              <option value="">Todos</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Parcela</label>
            <select value={parcelId} onChange={(e) => setParcelId(e.target.value)} className="field-input !h-12 !text-base" data-testid="filter-parcel">
              <option value="">Todas</option>
              {parcels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Producto</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="field-input !h-12 !text-base" data-testid="filter-product">
              <option value="">Todos</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={load} className="field-btn-secondary flex-1" data-testid="apply-filters-button">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Aplicar filtros"}
          </button>
          <button
            onClick={exportExcel}
            disabled={exporting || rows.length === 0}
            className="field-btn-accent flex-1 disabled:opacity-60"
            data-testid="export-excel-button"
          >
            {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Download className="w-5 h-5" /> Exportar a Excel</>}
          </button>
        </div>
        <button
          onClick={shareReport}
          disabled={sharing || rows.length === 0}
          className="w-full h-12 rounded-xl bg-[#1E2746] hover:bg-[#172038] active:scale-[0.99] text-white font-extrabold flex items-center justify-center gap-2 shadow-md disabled:opacity-60 border-2 border-[#111A2E]"
          data-testid="share-report-button"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          {sharing ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Share2 className="w-5 h-5" /> Compartir reporte</>}
        </button>
        <p className="text-[11px] text-[#889078] font-semibold text-center -mt-1">
          Abre tu bandeja de compartir: WhatsApp, Mensajes, Gmail, Correo, Telegram…
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-[#1E4620] text-white p-4 border-2 border-[#153417] shadow-sm" data-testid="report-total-kilos">
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-90 flex items-center gap-1"><Wheat className="w-3.5 h-3.5" /> Kilos</div>
          <div className="font-mono-stat text-xl sm:text-2xl mt-1">{formatNumber(totals.kilos, 2)}</div>
        </div>
        <div className="rounded-2xl bg-white border-2 border-[#E2DDD0] text-[#1A2210] p-4 shadow-sm" data-testid="report-total-units">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#556047]">Unidades</div>
          <div className="font-mono-stat text-xl sm:text-2xl mt-1">{formatNumber(totals.units, 0)}</div>
        </div>
        <div className="rounded-2xl bg-[#E65100] text-white p-4 border-2 border-[#C63D00] shadow-sm" data-testid="report-total-payment">
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-90 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> Total pago</div>
          <div className="font-mono-stat text-xl sm:text-2xl mt-1">{formatCurrency(totals.payment)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="field-card overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F0EDE1] text-[#1A2210] text-left">
              <tr>
                <th className="px-4 py-3 font-bold">Fecha</th>
                <th className="px-4 py-3 font-bold">Trabajador</th>
                <th className="px-4 py-3 font-bold">Parcela</th>
                <th className="px-4 py-3 font-bold">Producto</th>
                <th className="px-4 py-3 font-bold text-right">Kg</th>
                <th className="px-4 py-3 font-bold text-right">Unid.</th>
                <th className="px-4 py-3 font-bold text-right">Pago</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-6 text-[#556047] font-semibold">Sin resultados</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#E2DDD0]" data-testid={`report-row-${r.id}`}>
                  <td className="px-4 py-2.5 font-semibold">{r.date}</td>
                  <td className="px-4 py-2.5">{r.worker_name}</td>
                  <td className="px-4 py-2.5">{r.parcel_name}</td>
                  <td className="px-4 py-2.5">{r.product_name}</td>
                  <td className="px-4 py-2.5 text-right font-mono-stat">{formatNumber(r.kilos, 2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono-stat">{formatNumber(r.units, 0)}</td>
                  <td className="px-4 py-2.5 text-right font-mono-stat text-[#15803D]">{formatCurrency(r.payment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked list */}
        <div className="md:hidden divide-y divide-[#E2DDD0]">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-[#556047] font-semibold">Sin resultados</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="p-3" data-testid={`report-row-m-${r.id}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-[#1A2210]">{r.worker_name}</div>
                    <div className="text-xs text-[#556047] font-semibold">{r.date} • {r.parcel_name}</div>
                    <div className="text-xs text-[#556047] font-semibold">{r.product_name} • {formatNumber(r.kilos, 2)} Kg • {formatNumber(r.units, 0)} u.</div>
                  </div>
                  <div className="font-mono-stat text-base text-[#15803D]">{formatCurrency(r.payment)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </>
      )}

      {/* Reset confirmation modal */}
      {showReset && (
        <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={() => !resetting && setShowReset(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()} data-testid="reset-modal">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
                Borrar todo el historial
              </h3>
            </div>
            <p className="text-sm text-[#556047] font-semibold mb-3">
              Esta acción es <b className="text-red-700">irreversible</b>. Se eliminarán todas las cosechas
              {resetIncludeAttendance ? " y las asistencias" : ""} de tu cuenta.
              Los trabajadores, parcelas y productos NO se tocan.
            </p>
            <label className="flex items-center gap-2 text-sm font-semibold text-[#1A2210] mb-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resetIncludeAttendance}
                onChange={(e) => setResetIncludeAttendance(e.target.checked)}
                className="w-4 h-4 accent-red-600"
                data-testid="reset-include-attendance"
              />
              Borrar también asistencias (Check-in/Check-out)
            </label>
            <label className="block text-xs font-bold text-[#1A2210] uppercase tracking-wider mb-1">
              Escribe <span className="text-red-600 font-mono">BORRAR</span> para confirmar
            </label>
            <input
              type="text"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="BORRAR"
              className="field-input !h-12 !text-base w-full mb-4 uppercase"
              data-testid="reset-confirm-input"
              autoFocus
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { if (!resetting) { setShowReset(false); setResetConfirm(""); } }}
                className="flex-1 h-12 rounded-xl bg-[#F0EDE1] hover:bg-[#E2DDD0] text-[#556047] font-bold"
                data-testid="reset-cancel"
              >
                Cancelar
              </button>
              <button
                onClick={resetAll}
                disabled={resetting || resetConfirm.trim().toUpperCase() !== "BORRAR"}
                className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold disabled:opacity-50 flex items-center justify-center gap-1.5"
                data-testid="reset-confirm-btn"
              >
                {resetting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Trash2 className="w-5 h-5" /> Borrar todo</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
