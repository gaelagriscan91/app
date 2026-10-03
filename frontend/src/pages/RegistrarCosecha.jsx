import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, Loader2, Save, X, Edit3, ScanLine } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency, formatNumber, todayISO, formatApiErrorDetail } from "@/lib/api";
import ScanHarvestMode from "@/components/ScanHarvestMode";

export default function RegistrarCosecha() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mode = params.get("mode") === "qr" ? "qr" : "manual";
  const setMode = (m) => setParams(m === "qr" ? { mode: "qr" } : {});
  const [workers, setWorkers] = useState([]);
  const [parcels, setParcels] = useState([]);
  const [products, setProducts] = useState([]);

  const [workerId, setWorkerId] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [productId, setProductId] = useState("");
  const [kilos, setKilos] = useState("");
  const [units, setUnits] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [w, p, pr] = await Promise.all([
          api.get("/workers"),
          api.get("/parcels"),
          api.get("/products"),
        ]);
        setWorkers(w.data.filter((x) => x.active !== false));
        setParcels(p.data.filter((x) => x.active !== false));
        setProducts(pr.data.filter((x) => x.active !== false));
      } catch (e) {
        toast.error("No se pudieron cargar los módulos");
      }
    })();
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [productId, products]
  );

  useEffect(() => {
    if (selectedProduct) {
      setPricePerKg(String(selectedProduct.price_per_kg ?? 0));
      setPricePerUnit(String(selectedProduct.price_per_unit ?? 0));
    } else {
      setPricePerKg("");
      setPricePerUnit("");
    }
  }, [selectedProduct]);

  const payment = useMemo(() => {
    const k = parseFloat(kilos) || 0;
    const u = parseFloat(units) || 0;
    const pk = parseFloat(pricePerKg) || 0;
    const pu = parseFloat(pricePerUnit) || 0;
    return k * pk + u * pu;
  }, [kilos, units, pricePerKg, pricePerUnit]);

  const onPhotoChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(f);
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!workerId || !parcelId || !productId) {
      toast.error("Selecciona trabajador, parcela y producto");
      return;
    }
    if ((parseFloat(kilos) || 0) <= 0 && (parseFloat(units) || 0) <= 0) {
      toast.error("Ingresa kilos o unidades cosechadas");
      return;
    }
    setSaving(true);
    try {
      let photoPath = "";
      if (photoFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append("file", photoFile);
        const { data } = await api.post("/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        photoPath = data.path || "";
        setUploading(false);
      }
      await api.post("/harvests", {
        worker_id: workerId,
        parcel_id: parcelId,
        product_id: productId,
        kilos: parseFloat(kilos) || 0,
        units: parseFloat(units) || 0,
        price_per_kg: parseFloat(pricePerKg) || 0,
        price_per_unit: parseFloat(pricePerUnit) || 0,
        date,
        photo_path: photoPath,
        notes,
      });
      toast.success("Cosecha registrada");
      navigate("/dia");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Error al guardar");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="registrar-cosecha-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
          Registrar cosecha
        </h1>
        <p className="text-sm text-[#556047] font-semibold">Captura rápida en el campo</p>
      </div>

      {/* Mode toggle */}
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
          <Edit3 className="w-4 h-4" />
          Manual
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
          <ScanLine className="w-4 h-4" />
          Escanear por QR
        </button>
      </div>

      {mode === "qr" ? <ScanHarvestMode /> : (
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="field-card p-4 sm:p-5 space-y-4">
          <div>
            <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Trabajador</label>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="field-input"
              required
              data-testid="worker-select"
            >
              <option value="">— Seleccionar —</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Parcela</label>
            <select
              value={parcelId}
              onChange={(e) => setParcelId(e.target.value)}
              className="field-input"
              required
              data-testid="parcel-select"
            >
              <option value="">— Seleccionar —</option>
              {parcels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.crop_type ? `• ${p.crop_type}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Producto</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="field-input"
              required
              data-testid="product-select"
            >
              <option value="">— Seleccionar —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="field-input"
              data-testid="date-input"
            />
          </div>
        </div>

        <div className="field-card p-4 sm:p-5 space-y-4">
          <h3 className="text-base font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
            Cantidad y precio
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">Kilos (Kg)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={kilos}
                onChange={(e) => setKilos(e.target.value)}
                className="field-input"
                placeholder="0"
                data-testid="kilos-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">
                Unidades {selectedProduct?.unit_label ? `(${selectedProduct.unit_label})` : ""}
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="field-input"
                placeholder="0"
                data-testid="units-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">$ / Kg</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={pricePerKg}
                onChange={(e) => setPricePerKg(e.target.value)}
                className="field-input"
                placeholder="0.00"
                data-testid="price-per-kg-input"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">$ / Unidad</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
                className="field-input"
                placeholder="0.00"
                data-testid="price-per-unit-input"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-[#E65100] text-white p-4 flex items-center justify-between" data-testid="calculated-payment-display">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">Pago calculado</div>
              <div className="text-xs opacity-85 mt-0.5 font-semibold">
                {formatNumber(parseFloat(kilos) || 0, 2)} Kg + {formatNumber(parseFloat(units) || 0, 2)} u.
              </div>
            </div>
            <div className="font-mono-stat text-2xl sm:text-3xl">{formatCurrency(payment)}</div>
          </div>
        </div>

        <div className="field-card p-4 sm:p-5 space-y-3">
          <h3 className="text-base font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
            Foto de evidencia
          </h3>
          {photoPreview ? (
            <div className="relative rounded-2xl overflow-hidden border-2 border-[#E2DDD0]">
              <img src={photoPreview} alt="preview" className="w-full h-56 object-cover" />
              <button
                type="button"
                onClick={clearPhoto}
                className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
                data-testid="photo-clear-button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <label className="field-btn-secondary cursor-pointer" data-testid="photo-upload-label">
              <Camera className="w-5 h-5" /> Tomar / Subir foto (opcional)
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPhotoChange}
                className="hidden"
                data-testid="harvest-photo-input"
              />
            </label>
          )}

          <div>
            <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="field-input !h-auto py-3"
              placeholder="Observaciones del lote…"
              data-testid="notes-input"
            />
          </div>
        </div>

        <button type="submit" disabled={saving} className="field-btn-primary disabled:opacity-60" data-testid="save-harvest-button">
          {saving || uploading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              <Save className="w-6 h-6" /> Guardar cosecha
            </>
          )}
        </button>
      </form>
      )}
    </div>
  );
}
