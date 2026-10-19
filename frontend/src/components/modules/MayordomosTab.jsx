import { useEffect, useState } from "react";
import { Loader2, Mail, Shield, Trash2, Ban, CheckCircle2, Pencil, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { confirmAction } from "@/lib/confirm";
import api, { formatApiErrorDetail } from "@/lib/api";

const UNLOCK_DAYS = [3, 7, 15, 30];

const isExpired = (u) => u.access_expires_at && new Date(u.access_expires_at).getTime() <= Date.now();

function daysLeft(u) {
  if (!u.access_expires_at || isExpired(u)) return null;
  return Math.max(1, Math.ceil((new Date(u.access_expires_at).getTime() - Date.now()) / 86400000));
}

function statusOf(u) {
  if (u.active === false || isExpired(u)) return { label: "Bloqueado", cls: "bg-[#889078] text-white" };
  if (u.unlocked_by === "trial") return { label: "Prueba gratis", cls: "bg-emerald-600 text-white" };
  if (u.unlocked_by === "paypal") return { label: "Pagado", cls: "bg-[#FFC439] text-[#003087]" };
  return { label: "Activo", cls: "bg-[#2563EB] text-white" };
}

export default function MayordomosTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/mayordomos");
      setRows((data || []).filter((u) => u.role !== "admin"));
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const [unlocking, setUnlocking] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const startEdit = (u) => {
    setUnlocking(null);
    setForm({ email: u.email, password: "" });
    setShowPw(false);
    setEditing(editing === u.id ? null : u.id);
  };

  const saveEdit = async (u) => {
    const email = form.email.trim();
    if (!email) return toast.error("Escribe el correo");
    if (form.password && form.password.length < 6) return toast.error("La contraseña debe tener al menos 6 caracteres");
    const payload = { name: u.name };
    if (email.toLowerCase() !== u.email) payload.email = email;
    if (form.password) payload.password = form.password;
    if (!payload.email && !payload.password) { setEditing(null); return; }
    setSaving(true);
    try {
      await api.patch(`/admin/mayordomos/${u.id}`, payload);
      toast.success("Usuario actualizado");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const unlockFor = async (u, days) => {
    try {
      await api.patch(`/admin/mayordomos/${u.id}`, { active: true, name: u.name, access_days: days });
      toast.success(`${u.name} desbloqueado por ${days} días`);
      setUnlocking(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo desbloquear");
    }
  };

  const onToggleBlock = async (u) => {
    const willBlock = u.active !== false && !isExpired(u);
    if (!willBlock) { setEditing(null); setUnlocking(unlocking === u.id ? null : u.id); return; }
    if (!(await confirmAction(`¿Bloquear a ${u.name}?`, "Bloquear"))) return;
    try {
      await api.patch(`/admin/mayordomos/${u.id}`, { active: false, name: u.name });
      toast.success(`${u.name} bloqueado`);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo actualizar");
    }
  };

  const onDelete = async (u) => {
    if (!(await confirmAction(`¿Eliminar la cuenta de ${u.name}? Se borrará la cuenta y toda su información. No se puede deshacer.`, "Eliminar"))) return;
    try {
      await api.delete(`/admin/mayordomos/${u.id}`);
      toast.success("Cuenta eliminada");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo eliminar");
    }
  };

  if (loading) return <div className="flex justify-center py-8 text-[#1D4ED8]"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4" data-testid="mayordomos-tab">
      <h2 className="text-lg font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>Usuarios ({rows.length})</h2>
      {rows.length === 0 ? (
        <div className="field-card p-8 text-center">
          <Shield className="w-10 h-10 mx-auto text-[#889078] mb-2" />
          <p className="text-[#556047] font-semibold">Aún no hay usuarios registrados</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((u) => {
            const st = statusOf(u);
            const isBlocked = u.active === false || isExpired(u);
            const left = daysLeft(u);
            return (
              <div key={u.id} className="field-card p-4" data-testid={`mayordomo-row-${u.id}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-[#1A2210] truncate text-base" style={{ fontFamily: "Outfit, sans-serif" }}>{u.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${st.cls}`} data-testid={`mayordomo-status-${u.id}`}>{st.label}</span>
                </div>
                <p className="text-xs text-[#556047] font-semibold truncate flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" /> {u.email}</p>
                {left && !isBlocked && (
                  <p className="text-[11px] font-extrabold mt-0.5 text-amber-700" data-testid={`mayordomo-days-left-${u.id}`}>
                    Se bloquea en {left} día{left !== 1 ? "s" : ""}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onToggleBlock(u)}
                    className={`flex-1 h-10 border-2 font-bold rounded-lg text-sm flex items-center justify-center gap-1.5 transition-colors ${
                      isBlocked ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                    }`}
                    data-testid={`mayordomo-toggle-block-${u.id}`}
                  >
                    {isBlocked ? <><CheckCircle2 className="w-4 h-4" /> Desbloquear</> : <><Ban className="w-4 h-4" /> Bloquear</>}
                  </button>
                  <button
                    onClick={() => startEdit(u)}
                    className="h-10 px-3 bg-white border-2 border-blue-100 hover:bg-blue-50 text-[#1D4ED8] font-bold rounded-lg flex items-center justify-center transition-colors"
                    data-testid={`mayordomo-edit-${u.id}`}
                    aria-label="Editar usuario"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(u)}
                    className="h-10 px-3 bg-white border-2 border-red-100 hover:bg-red-50 text-red-600 font-bold rounded-lg flex items-center justify-center transition-colors"
                    data-testid={`mayordomo-delete-${u.id}`}
                    aria-label="Eliminar cuenta"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {editing === u.id && (
                  <div className="mt-3 rounded-xl bg-[#EEF2FF] border-2 border-blue-200 p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200" data-testid={`mayordomo-edit-form-${u.id}`}>
                    <p className="text-xs font-bold text-[#1E3A8A]">Editar correo y contraseña</p>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Correo" className="field-input !h-11 w-full" data-testid={`mayordomo-edit-email-${u.id}`} />
                    <div className="relative">
                      <input type={showPw ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Nueva contraseña (dejar vacío para no cambiar)" autoComplete="new-password" className="field-input !h-11 w-full pr-10" data-testid={`mayordomo-edit-password-${u.id}`} />
                      <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#556047]" aria-label="Mostrar contraseña" data-testid={`mayordomo-edit-toggle-${u.id}`}>
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setEditing(null)} disabled={saving} className="h-10 rounded-lg bg-white border-2 border-[#E2DDD0] text-[#556047] font-bold" data-testid={`mayordomo-edit-cancel-${u.id}`}>Cancelar</button>
                      <button onClick={() => saveEdit(u)} disabled={saving} className="h-10 rounded-lg bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-bold flex items-center justify-center transition-colors disabled:opacity-60" data-testid={`mayordomo-edit-save-${u.id}`}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                      </button>
                    </div>
                  </div>
                )}
                {unlocking === u.id && (
                  <div className="mt-3 rounded-xl bg-emerald-50 border-2 border-emerald-200 p-3 animate-in fade-in slide-in-from-top-1 duration-200" data-testid={`mayordomo-unlock-days-${u.id}`}>
                    <p className="text-xs font-bold text-emerald-800 mb-2">¿Cuántos días desbloqueado?</p>
                    <div className="grid grid-cols-4 gap-2">
                      {UNLOCK_DAYS.map((d) => (
                        <button
                          key={d}
                          onClick={() => unlockFor(u, d)}
                          className="h-10 rounded-lg bg-white border-2 border-emerald-300 text-emerald-800 font-extrabold text-sm hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-colors"
                          data-testid={`mayordomo-unlock-${d}-${u.id}`}
                        >
                          {d} días
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
