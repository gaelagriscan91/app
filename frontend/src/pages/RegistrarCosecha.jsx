import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Save, Edit3, ScanLine, DollarSign } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, todayISO, formatApiErrorDetail } from "@/lib/api";
import ScanHarvestMode from "@/components/ScanHarvestMode";

export default function RegistrarCosecha() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mode = params.get("mode") === "qr" ? "qr" : "manual";
  const setMode = (m) => setParams(m === "qr" ? { mode: "qr" } : {});

  const todayKey = todayISO();

  const [workers, setWorkers] = useState([]);
  const [parcelId, setParcelId] = useState("");
  const [productId, setProductId] = useState("");
  const [unitLabel, setUnitLabel] = useState("unidad");

  const [workerName, setWorkerName] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [units, setUnits] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  // Resolve defaults (session → first → auto-create)
  useEffect(() => {
    (async () => {
      try {
        let session = {};
        try { session = JSON.parse(localStorage.getItem(`agriscan.session.${todayKey}`) || "{}"); }
        catch { session = {}; }

        const [wRes, pRes, prRes] = await Promise.all([
          api.get("/workers"),
          api.get("/parcels"),
          api.get("/products"),
        ]);
        setWorkers((wRes.data || []).filter((x) => x.active !== false));
        let parcels = (pRes.data || []).filter((x) => x.active !== false);
        let products = (prRes.data || []).filter((x) => x.active !== false);

        if (parcels.length === 0) {
          const { data } = await api.post("/parcels", { name: "Rancho General", active: true });
          parcels = [data];
        }
        if (products.length === 0) {
          const { data } = await api.post("/products", { name: "Cosecha", unit_label: "pieza", pricing_mode: "unit", active: true });
          products = [data];
        }

        const parcel = parcels.find((p) => p.id === session.parcelId) || parcels[0];
        const product = products.find((p) => p.id === session.productId) || products[0];

        setParcelId(parcel.id);
        setProductId(product.id);
        setUnitLabel(product.unit_label || "unidad");

        const pu = Number(product.price_per_unit) || 0;
        if (pu > 0) setPricePerUnit(String(pu));

        setReady(true);
      } catch (_) {
        toast.error("No se pudieron cargar los datos");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payment = useMemo(() => {
    const u = parseFloat(units) || 0;
    const pu = parseFloat(pricePerUnit) || 0;
    return u * pu;
  }, [units, pricePerUnit]);

  const onSubmit = async (e) => {
    e.preventDefault();
    let wid = workerId;
    if (!wid && workerName.trim()) {
      const typed = workerName.trim().toLowerCase();
      const found = workers.find((w) => w.name?.toLowerCase() === typed);
      if (found) {
        wid = found.id;
      } else {
        try {
          const { data } = await api.post("/workers", { name: workerName.trim(), role: "Cosechador" });
          wid = data.id;
          setWorkers((prev) => [...prev, data]);
        } catch (err) {
          toast.error("No se pudo crear el trabajador");
          return;
        }
      }
    }
    if (!wid) {
      toast.error("Escribe el nombre del trabajador");
      return;
    }
    if ((parseFloat(units) || 0) <= 0) {
      toast.error("Ingresa la cantidad cosechada");
      return;
    }
    if ((parseFloat(pricePerUnit) || 0) <= 0) {
      toast.error("Pon el precio antes de guardar");
      return;
    }
    setSaving(true);
    try {
      await api.post("/harvests", {
        worker_id: wid,
        parcel_id: parcelId,
        product_id: productId,
        kilos: 0,
        units: parseFloat(units) || 0,
        price_per_kg: 0,
        price_per_unit: parseFloat(pricePerUnit) || 0,
        price_mode: "piece",
        date: todayKey,
        photo_path: "",
        notes: "",
      });
      toast.success("Cosecha registrada");
      setWorkerName("");
      setWorkerId("");
      setUnits("");
      navigate("/dia");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="registrar-cosecha-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
          Cosechar
        </h1>
        <p className="text-sm text-[#556047] font-semibold">Captura rápida</p>
      </div>

      {/* Mode toggle: Manual / Escanear */}
      <div className="field-card p-1.5 flex gap-1.5">
        <button
          onClick={() => setMode("manual")}
          data-testid="mode-manual-button"
          className={`flex-1 flex items-center justify-center gap-2 h-12 px-4 rounded-xl font-bold text-sm transition-all ${
            mode === "manual"
              ? "bg-[#1E4620] text-white shadow-md"
              : "text-[#556047] hover:bg-[#F0EDE1]"
          }`}
        >
          <Edit3 className="w-4 h-4" /> Manual
        </button>
        <button
          onClick={() => setMode("qr")}
          data-testid="mode-qr-button"
          className={`flex-1 flex items-center justify-center gap-2 h-12 px-4 rounded-xl font-bold text-sm transition-all ${
            mode === "qr"
              ? "bg-[#1E4620] text-white shadow-md"
              : "text-[#556047] hover:bg-[#F0EDE1]"
          }`}
        >
          <ScanLine className="w-4 h-4" /> Escanear
        </button>
      </div>

      {mode === "qr" ? <ScanHarvestMode /> : !ready ? (
        <div className="field-card p-6 flex items-center justify-center gap-2 text-[#556047] font-bold" data-testid="manual-loading">
          <Loader2 className="w-5 h-5 animate-spin" /> Preparando…
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {/* Worker */}
          <div className="field-card p-4 sm:p-5 space-y-2">
            <label className="block text-xs font-bold text-[#1A2210] uppercase tracking-wider">Trabajador</label>
            <input
              type="text"
              value={workerName}
              onChange={(e) => {
                setWorkerName(e.target.value);
                const found = workers.find((w) => w.name?.toLowerCase() === e.target.value.trim().toLowerCase());
                setWorkerId(found?.id || "");
              }}
              list="worker-name-suggestions"
              placeholder="Nombre del trabajador"
              className="field-input !h-12 !text-base w-full"
              autoComplete="off"
              required
              data-testid="worker-name-input"
            />
            <datalist id="worker-name-suggestions">
              {workers.map((w) => <option key={w.id} value={w.name} />)}
            </datalist>
          </div>

          {/* Quantity */}
          <div className="field-card p-4 sm:p-5 space-y-2">
            <label className="block text-xs font-bold text-[#1A2210] uppercase tracking-wider">
              Cantidad ({unitLabel})
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              placeholder="0"
              className="field-input !h-14 !text-xl font-mono-stat w-full"
              data-testid="units-input"
            />
          </div>

          {/* Price */}
          <div className="field-card p-4 sm:p-5 space-y-2">
            <label className="block text-xs font-bold text-[#1A2210] uppercase tracking-wider">
              Precio por {unitLabel} ($)
            </label>
            <div className="relative">
              <DollarSign className="w-5 h-5 text-[#889078] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
                placeholder="0.00"
                className="field-input !h-14 !text-xl font-mono-stat w-full !pl-10"
                data-testid="price-per-unit-input"
              />
            </div>
          </div>

          {/* Payment preview */}
          <div className="rounded-2xl bg-[#E65100] text-white p-4 flex items-center justify-between" data-testid="calculated-payment-display">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">Pago</div>
            <div className="font-mono-stat text-2xl sm:text-3xl">{formatCurrency(payment)}</div>
          </div>

          <button type="submit" disabled={saving} className="field-btn-primary disabled:opacity-60" data-testid="save-harvest-button">
            {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Save className="w-6 h-6" /> Guardar</>}
          </button>
        </form>
      )}
    </div>
  );
}
