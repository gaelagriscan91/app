import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, X, Save, Scale, Hash, Package2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatCurrency } from "@/lib/api";

const EMPTY = {
  name: "",
  price_per_kg: 0,
  price_per_unit: 0,
  unit_label: "caja",
  weight_unit: "kg",
  pricing_mode: "both",
  active: true,
};

const WEIGHT_LABELS = { kg: "Kg", lb: "Lb" };

export default function ProductsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/products"); setRows(data); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startNew = () => { setForm(EMPTY); setEditing("new"); };
  const startEdit = (r) => {
    setForm({
      name: r.name,
      price_per_kg: r.price_per_kg || 0,
      price_per_unit: r.price_per_unit || 0,
      unit_label: r.unit_label || "caja",
      weight_unit: r.weight_unit || "kg",
      pricing_mode: r.pricing_mode || (r.price_per_kg > 0 && r.price_per_unit > 0 ? "both" : r.price_per_kg > 0 ? "weight" : "unit"),
      active: r.active !== false,
    });
    setEditing(r.id);
  };
  const cancel = () => { setEditing(null); setForm(EMPTY); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        price_per_kg: form.pricing_mode === "unit" ? 0 : (parseFloat(form.price_per_kg) || 0),
        price_per_unit: form.pricing_mode === "weight" ? 0 : (parseFloat(form.price_per_unit) || 0),
      };
      if (editing === "new") { await api.post("/products", payload); toast.success("Producto agregado"); }
      else { await api.put(`/products/${editing}`, payload); toast.success("Producto actualizado"); }
      await load(); cancel();
    } catch (e) { toast.error("No se pudo guardar"); } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("¿Eliminar este producto?")) return;
    try { await api.delete(`/products/${id}`); toast.success("Eliminado"); load(); }
    catch (e) { toast.error("No se pudo eliminar"); }
  };

  const weightLabel = WEIGHT_LABELS[form.weight_unit] || "Kg";
  const showWeight = form.pricing_mode !== "unit";
  const showUnit = form.pricing_mode !== "weight";

  return (
    <div className="space-y-4">
      <button onClick={startNew} className="field-btn-primary" data-testid="add-product-button">
        <Plus className="w-5 h-5" /> Agregar producto
      </button>

      {editing && (
        <div className="field-card p-4 space-y-4" data-testid="product-form">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#1A2210]">{editing === "new" ? "Nuevo producto" : "Editar producto"}</h3>
            <button onClick={cancel} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1]"><X className="w-4 h-4 mx-auto" /></button>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Nombre del producto</label>
            <input className="field-input !h-12 !text-base" placeholder="Ej. Cherry, Naranja, Mandarina…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="product-name-input" />
          </div>

          {/* Pricing mode toggle */}
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">Modo de cobro</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, pricing_mode: "unit" })}
                data-testid="mode-unit"
                className={`h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-1 border-2 ${
                  form.pricing_mode === "unit"
                    ? "bg-[#1E4620] text-white border-[#1E4620]"
                    : "bg-white text-[#556047] border-[#E2DDD0] hover:bg-[#F7F5EE]"
                }`}
              >
                <Hash className="w-4 h-4" /> Por unidad
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, pricing_mode: "weight" })}
                data-testid="mode-weight"
                className={`h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-1 border-2 ${
                  form.pricing_mode === "weight"
                    ? "bg-[#1E4620] text-white border-[#1E4620]"
                    : "bg-white text-[#556047] border-[#E2DDD0] hover:bg-[#F7F5EE]"
                }`}
              >
                <Scale className="w-4 h-4" /> Por peso
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, pricing_mode: "both" })}
                data-testid="mode-both"
                className={`h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-1 border-2 ${
                  form.pricing_mode === "both"
                    ? "bg-[#1E4620] text-white border-[#1E4620]"
                    : "bg-white text-[#556047] border-[#E2DDD0] hover:bg-[#F7F5EE]"
                }`}
              >
                <Package2 className="w-4 h-4" /> Ambos
              </button>
            </div>
          </div>

          {/* Weight unit toggle (only if pricing by weight) */}
          {showWeight && (
            <div>
              <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">Unidad de peso</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, weight_unit: "kg" })}
                  data-testid="weight-kg"
                  className={`h-11 rounded-xl font-bold text-sm border-2 ${
                    form.weight_unit === "kg"
                      ? "bg-[#E65100] text-white border-[#E65100]"
                      : "bg-white text-[#556047] border-[#E2DDD0] hover:bg-[#F7F5EE]"
                  }`}
                >
                  Kilogramos (Kg)
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, weight_unit: "lb" })}
                  data-testid="weight-lb"
                  className={`h-11 rounded-xl font-bold text-sm border-2 ${
                    form.weight_unit === "lb"
                      ? "bg-[#E65100] text-white border-[#E65100]"
                      : "bg-white text-[#556047] border-[#E2DDD0] hover:bg-[#F7F5EE]"
                  }`}
                >
                  Libras (Lb)
                </button>
              </div>
            </div>
          )}

          {/* Price inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {showWeight && (
              <div>
                <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Precio por {weightLabel}</label>
                <input className="field-input !h-12 !text-base" type="number" step="0.01" placeholder="0.00" value={form.price_per_kg} onChange={(e) => setForm({ ...form, price_per_kg: e.target.value })} data-testid="product-price-kg-input" />
              </div>
            )}
            {showUnit && (
              <>
                <div>
                  <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Precio por {form.unit_label || "unidad"}</label>
                  <input className="field-input !h-12 !text-base" type="number" step="0.01" placeholder="0.00" value={form.price_per_unit} onChange={(e) => setForm({ ...form, price_per_unit: e.target.value })} data-testid="product-price-unit-input" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Nombre de la unidad</label>
                  <input className="field-input !h-12 !text-base" placeholder="caja, canasta, pieza, arpilla…" value={form.unit_label} onChange={(e) => setForm({ ...form, unit_label: e.target.value })} data-testid="product-unit-label-input" />
                </div>
              </>
            )}
          </div>

          <label className="flex items-center gap-2 font-semibold text-[#1A2210]">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-5 h-5 accent-[#1E4620]" />
            Activo
          </label>

          <button onClick={save} disabled={saving} className="field-btn-primary disabled:opacity-60" data-testid="product-save-button">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Guardar</>}
          </button>
        </div>
      )}

      <div className="field-card divide-y divide-[#E2DDD0]">
        {loading ? (
          <div className="p-6 flex justify-center text-[#1E4620]"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-[#556047] font-semibold">Sin productos</div>
        ) : (
          rows.map((r) => {
            const wu = WEIGHT_LABELS[r.weight_unit] || "Kg";
            const mode = r.pricing_mode || (r.price_per_kg > 0 && r.price_per_unit > 0 ? "both" : r.price_per_kg > 0 ? "weight" : "unit");
            return (
              <div key={r.id} className="p-3 flex items-center justify-between gap-3" data-testid={`product-row-${r.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#1A2210] truncate flex items-center gap-2">
                    {r.name}
                    <span className="text-[10px] bg-[#F0EDE1] text-[#556047] border border-[#D4CEB8] font-bold px-2 py-0.5 rounded-full uppercase">
                      {mode === "unit" ? "Unidad" : mode === "weight" ? wu : "Ambos"}
                    </span>
                  </div>
                  <div className="text-xs text-[#556047] font-semibold truncate mt-0.5">
                    {mode !== "unit" && <>{formatCurrency(r.price_per_kg)}/{wu}</>}
                    {mode === "both" && " • "}
                    {mode !== "weight" && <>{formatCurrency(r.price_per_unit)}/{r.unit_label || "unidad"}</>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => startEdit(r)} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1] text-[#1E4620]" data-testid={`product-edit-${r.id}`}><Pencil className="w-4 h-4 mx-auto" /></button>
                  <button onClick={() => remove(r.id)} className="w-9 h-9 rounded-lg hover:bg-red-50 text-red-600" data-testid={`product-delete-${r.id}`}><Trash2 className="w-4 h-4 mx-auto" /></button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
