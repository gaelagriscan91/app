import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Users, X, Save, UserCog } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const EMPTY = { name: "", boss_worker_id: "", worker_ids: [], notes: "", active: true };

export default function CrewsTab() {
  const [rows, setRows] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, w] = await Promise.all([api.get("/crews"), api.get("/workers")]);
      setRows(c.data);
      setWorkers(w.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const startNew = () => { setForm(EMPTY); setEditing("new"); };
  const startEdit = (r) => {
    setForm({
      name: r.name,
      boss_worker_id: r.boss_worker_id || "",
      worker_ids: r.worker_ids || (r.workers || []).map((w) => w.id),
      notes: r.notes || "",
      active: r.active !== false,
    });
    setEditing(r.id);
  };
  const cancel = () => { setEditing(null); setForm(EMPTY); };

  const toggleWorker = (wid) => {
    setForm((f) => ({
      ...f,
      worker_ids: f.worker_ids.includes(wid)
        ? f.worker_ids.filter((x) => x !== wid)
        : [...f.worker_ids, wid],
    }));
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      if (editing === "new") {
        await api.post("/crews", form);
        toast.success("Cuadrilla creada");
      } else {
        await api.put(`/crews/${editing}`, form);
        toast.success("Cuadrilla actualizada");
      }
      await load();
      cancel();
    } catch (e) { toast.error("No se pudo guardar"); } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("¿Eliminar esta cuadrilla? Los trabajadores no se eliminan.")) return;
    try { await api.delete(`/crews/${id}`); toast.success("Eliminada"); load(); }
    catch (e) { toast.error("No se pudo eliminar"); }
  };

  return (
    <div className="space-y-4">
      <button onClick={startNew} className="field-btn-primary" data-testid="add-crew-button">
        <Plus className="w-5 h-5" /> Agregar cuadrilla
      </button>

      {editing && (
        <div className="field-card p-4 space-y-3" data-testid="crew-form">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#1A2210]">{editing === "new" ? "Nueva cuadrilla" : "Editar cuadrilla"}</h3>
            <button onClick={cancel} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1]"><X className="w-4 h-4 mx-auto" /></button>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Nombre de la cuadrilla</label>
            <input className="field-input !h-12 !text-base" placeholder="Ej. Cuadrilla Norte" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="crew-name-input" />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Jefe de cuadrilla (Crew Boss)</label>
            <select className="field-input !h-12 !text-base" value={form.boss_worker_id} onChange={(e) => setForm({ ...form, boss_worker_id: e.target.value })} data-testid="crew-boss-select">
              <option value="">— Sin asignar —</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}{w.role ? " • " + w.role : ""}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Trabajadores ({form.worker_ids.length})</label>
            <div className="max-h-56 overflow-y-auto rounded-xl border-2 border-[#E2DDD0] p-2 space-y-1 bg-white">
              {workers.length === 0 ? (
                <p className="text-sm text-[#556047] font-semibold p-2">Primero crea trabajadores</p>
              ) : (
                workers.map((w) => (
                  <label key={w.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#F7F5EE] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.worker_ids.includes(w.id)}
                      onChange={() => toggleWorker(w.id)}
                      className="w-5 h-5 accent-[#1E4620]"
                      data-testid={`crew-worker-check-${w.id}`}
                    />
                    <span className="font-semibold text-[#1A2210] text-sm">{w.name}</span>
                    <span className="text-xs text-[#556047]">{w.role}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Notas</label>
            <textarea rows={2} className="field-input !h-auto !text-base py-3" placeholder="Observaciones de la cuadrilla…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="crew-notes-input" />
          </div>

          <label className="flex items-center gap-2 font-semibold text-[#1A2210]">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-5 h-5 accent-[#1E4620]" />
            Activa
          </label>

          <button onClick={save} disabled={saving} className="field-btn-primary disabled:opacity-60" data-testid="crew-save-button">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Guardar</>}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="field-card p-6 flex justify-center text-[#1E4620]"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="field-card p-6 text-center text-[#556047] font-semibold">
            Sin cuadrillas aún. Crea una para agrupar trabajadores con su jefe.
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="field-card p-4" data-testid={`crew-row-${r.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-lg text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>{r.name}</h3>
                  {r.boss ? (
                    <div className="inline-flex items-center gap-1 mt-1 text-xs font-bold bg-[#1E4620] text-white px-2 py-1 rounded-full">
                      <UserCog className="w-3.5 h-3.5" /> {r.boss.name}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 mt-1 text-xs font-bold bg-[#F0EDE1] text-[#556047] px-2 py-1 rounded-full">
                      Sin jefe asignado
                    </div>
                  )}
                  <div className="text-xs text-[#556047] font-semibold mt-2 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {r.worker_count} trabajador{r.worker_count !== 1 ? "es" : ""}
                  </div>
                  {r.workers?.length > 0 && (
                    <div className="text-xs text-[#889078] mt-1 truncate">
                      {r.workers.map((w) => w.name).join(", ")}
                    </div>
                  )}
                  {r.notes && <div className="text-xs italic text-[#889078] mt-1">{r.notes}</div>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => startEdit(r)} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1] text-[#1E4620]" data-testid={`crew-edit-${r.id}`}><Pencil className="w-4 h-4 mx-auto" /></button>
                  <button onClick={() => remove(r.id)} className="w-9 h-9 rounded-lg hover:bg-red-50 text-red-600" data-testid={`crew-delete-${r.id}`}><Trash2 className="w-4 h-4 mx-auto" /></button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
