import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, UserPlus, X, Save } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const EMPTY = { name: "", document_id: "", phone: "", role: "Cosechador", active: true };

export default function WorkersTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // id or "new"
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/workers");
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startNew = () => { setForm(EMPTY); setEditing("new"); };
  const startEdit = (r) => {
    setForm({ name: r.name, document_id: r.document_id || "", phone: r.phone || "", role: r.role || "Cosechador", active: r.active !== false });
    setEditing(r.id);
  };
  const cancel = () => { setEditing(null); setForm(EMPTY); };

  const save = async () => {
    if (!form.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      if (editing === "new") {
        await api.post("/workers", form);
        toast.success("Trabajador agregado");
      } else {
        await api.put(`/workers/${editing}`, form);
        toast.success("Trabajador actualizado");
      }
      await load();
      cancel();
    } catch (e) {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("¿Eliminar este trabajador?")) return;
    try {
      await api.delete(`/workers/${id}`);
      toast.success("Eliminado");
      load();
    } catch (e) { toast.error("No se pudo eliminar"); }
  };

  return (
    <div className="space-y-4">
      <button onClick={startNew} className="field-btn-primary" data-testid="add-worker-button">
        <UserPlus className="w-5 h-5" /> Agregar trabajador
      </button>

      {editing && (
        <div className="field-card p-4 space-y-3" data-testid="worker-form">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#1A2210]">{editing === "new" ? "Nuevo trabajador" : "Editar trabajador"}</h3>
            <button onClick={cancel} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1]"><X className="w-4 h-4 mx-auto" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="field-input !h-12 !text-base" placeholder="Nombre completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="worker-name-input" />
            <input className="field-input !h-12 !text-base" placeholder="Documento / ID" value={form.document_id} onChange={(e) => setForm({ ...form, document_id: e.target.value })} data-testid="worker-document-input" />
            <input className="field-input !h-12 !text-base" placeholder="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="worker-phone-input" />
            <select className="field-input !h-12 !text-base" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="worker-role-input">
              <option>Cosechador</option>
              <option>Supervisor</option>
              <option>Chofer</option>
              <option>Empacador</option>
              <option>Otro</option>
            </select>
          </div>
          <label className="flex items-center gap-2 font-semibold text-[#1A2210]">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-5 h-5 accent-[#1E4620]" />
            Activo
          </label>
          <button onClick={save} disabled={saving} className="field-btn-primary disabled:opacity-60" data-testid="worker-save-button">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Guardar</>}
          </button>
        </div>
      )}

      <div className="field-card divide-y divide-[#E2DDD0]">
        {loading ? (
          <div className="p-6 flex justify-center text-[#1E4620]"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-[#556047] font-semibold">Sin trabajadores</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="p-3 flex items-center justify-between gap-3" data-testid={`worker-row-${r.id}`}>
              <div className="min-w-0">
                <div className="font-bold text-[#1A2210] truncate">{r.name}</div>
                <div className="text-xs text-[#556047] font-semibold truncate">
                  {r.role || "—"} • {r.document_id || "sin ID"} • {r.phone || "sin tel."}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {r.active === false ? (
                  <span className="text-[10px] bg-red-50 text-red-700 border border-red-200 font-bold px-2 py-0.5 rounded-full">Inactivo</span>
                ) : (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded-full">Activo</span>
                )}
                <button onClick={() => startEdit(r)} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1] text-[#1E4620]" data-testid={`worker-edit-${r.id}`}><Pencil className="w-4 h-4 mx-auto" /></button>
                <button onClick={() => remove(r.id)} className="w-9 h-9 rounded-lg hover:bg-red-50 text-red-600" data-testid={`worker-delete-${r.id}`}><Trash2 className="w-4 h-4 mx-auto" /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
