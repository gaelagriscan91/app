import { useEffect, useMemo, useState } from "react";
import { Download, Filter, Loader2, Wheat, DollarSign } from "lucide-react";
import { toast } from "sonner";
import api, { API, formatCurrency, formatNumber } from "@/lib/api";

function startOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Reportes() {
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

  return (
    <div className="space-y-5" data-testid="reportes-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
          Reportes de cosecha
        </h1>
        <p className="text-sm text-[#556047] font-semibold">Filtra y exporta a Excel</p>
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
    </div>
  );
}
