import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, X, Save } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const EMPTY = { name: "", hectares: 0, crop_type: "", location: "", active: true };

export default function ParcelsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/parcels"); setRows(data); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startNew = () => { setForm(EMPTY); setEditing("new"); };
  const startEdit = (r) => {
    setForm({ name: r.name, hectares: r.hectares || 0, crop_type: r.crop_type || "", location: r.location || "", active: r.active !== false });
    setEditing(r.id);
  };
  const cancel = () => { setEditing(null); setForm(EMPTY); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      const payload = { ...form, hectares: parseFloat(form.hectares) || 0 };
      if (editing === "new") { await api.post("/parcels", payload); toast.success("Parcela agregada"); }
      else { await api.put(`/parcels/${editing}`, payload); toast.success("Parcela actualizada"); }
      await load(); cancel();
    } catch (e) { toast.error("No se pudo guardar"); } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("¿Eliminar esta parcela?")) return;
    try { await api.delete(`/parcels/${id}`); toast.success("Eliminada"); load(); } catch (e) { toast.error("No se pudo eliminar"); }
  };

  return (
    <div className="space-y-4">
      <button onClick={startNew} className="field-btn-primary" data-testid="add-parcel-button">
        <Plus className="w-5 h-5" /> Agregar parcela
      </button>

      {editing && (
        <div className="field-card p-4 space-y-3" data-testid="parcel-form">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#1A2210]">{editing === "new" ? "Nueva parcela" : "Editar parcela"}</h3>
            <button onClick={cancel} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1]"><X className="w-4 h-4 mx-auto" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="field-input !h-12 !text-base" placeholder="Nombre / Lote" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="parcel-name-input" />
            <input className="field-input !h-12 !text-base" type="number" step="0.01" placeholder="Hectáreas" value={form.hectares} onChange={(e) => setForm({ ...form, hectares: e.target.value })} data-testid="parcel-hectares-input" />
            <input className="field-input !h-12 !text-base" placeholder="Tipo de cultivo" value={form.crop_type} onChange={(e) => setForm({ ...form, crop_type: e.target.value })} data-testid="parcel-crop-input" />
            <input className="field-input !h-12 !text-base" placeholder="Ubicación" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} data-testid="parcel-location-input" />
          </div>
          <label className="flex items-center gap-2 font-semibold text-[#1A2210]">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-5 h-5 accent-[#1E4620]" />
            Activa
          </label>
          <button onClick={save} disabled={saving} className="field-btn-primary disabled:opacity-60" data-testid="parcel-save-button">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Guardar</>}
          </button>
        </div>
      )}

      <div className="field-card divide-y divide-[#E2DDD0]">
        {loading ? (
          <div className="p-6 flex justify-center text-[#1E4620]"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-[#556047] font-semibold">Sin parcelas</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="p-3 flex items-center justify-between gap-3" data-testid={`parcel-row-${r.id}`}>
              <div className="min-w-0">
                <div className="font-bold text-[#1A2210] truncate">{r.name}</div>
                <div className="text-xs text-[#556047] font-semibold truncate">
                  {r.crop_type || "—"} • {r.hectares || 0} ha • {r.location || "sin ubicación"}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => startEdit(r)} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1] text-[#1E4620]" data-testid={`parcel-edit-${r.id}`}><Pencil className="w-4 h-4 mx-auto" /></button>
                <button onClick={() => remove(r.id)} className="w-9 h-9 rounded-lg hover:bg-red-50 text-red-600" data-testid={`parcel-delete-${r.id}`}><Trash2 className="w-4 h-4 mx-auto" /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
