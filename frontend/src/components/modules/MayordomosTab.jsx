import { useEffect, useState } from "react";
import {
  UserPlus, Loader2, Mail, Lock, User as UserIcon, Shield,
  Edit3, Trash2, X, KeyRound, Eye, EyeOff, Users, MapPin, Package,
} from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";

export default function MayordomosTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/mayordomos");
      setRows(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const onDelete = async (u) => {
    if (!window.confirm(`¿Eliminar cuenta de ${u.name}? Sus datos se transferirán a tu cuenta admin.`)) return;
    try {
      await api.delete(`/admin/mayordomos/${u.id}`);
      toast.success("Cuenta eliminada");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo eliminar");
    }
  };

  return (
    <div className="space-y-4" data-testid="mayordomos-tab">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
          Mayordomos ({rows.length})
        </h2>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="h-11 px-4 bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-bold rounded-xl flex items-center gap-1.5"
          data-testid="mayordomo-add-button"
        >
          <UserPlus className="w-4 h-4" /> Nuevo mayordomo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-[#1D4ED8]"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="field-card p-8 text-center">
          <Shield className="w-10 h-10 mx-auto text-[#889078] mb-2" />
          <p className="text-[#556047] font-semibold">Aún no has creado mayordomos</p>
          <p className="text-xs text-[#889078] mt-1">Toca <b>Nuevo mayordomo</b> para dar acceso a tu primer capataz</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((u) => {
            const isAdmin = u.role === "admin";
            const isInactive = u.active === false;
            return (
              <div
                key={u.id}
                className={`field-card p-4 border-l-4 ${isAdmin ? "border-l-[#2563EB]" : isInactive ? "border-l-[#889078]" : "border-l-[#2563EB]"}`}
                data-testid={`mayordomo-row-${u.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-[#1A2210] truncate text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
                        {u.name}
                      </h3>
                      {isAdmin ? (
                        <span className="bg-[#2563EB] text-white px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                          <Shield className="w-3 h-3" /> Admin
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isInactive ? "bg-[#889078] text-white" : "bg-[#2563EB] text-white"}`}>
                          {isInactive ? "Inactivo" : "Activo"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#556047] font-semibold truncate flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3" /> {u.email}
                    </p>
                  </div>
                </div>

                {!isAdmin && (
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#E2DDD0]">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-[#889078]"><Users className="w-3 h-3" /><span className="text-[10px] font-bold uppercase">Trab.</span></div>
                      <div className="font-mono-stat text-base text-[#1A2210]">{u.workers_count || 0}</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-[#889078]"><MapPin className="w-3 h-3" /><span className="text-[10px] font-bold uppercase">Ranc.</span></div>
                      <div className="font-mono-stat text-base text-[#1A2210]">{u.parcels_count || 0}</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-[#889078]"><Package className="w-3 h-3" /><span className="text-[10px] font-bold uppercase">Cos.</span></div>
                      <div className="font-mono-stat text-base text-[#1A2210]">{u.harvests_count || 0}</div>
                    </div>
                  </div>
                )}

                {!isAdmin && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => { setEditing(u); setShowForm(true); }}
                      className="flex-1 h-9 bg-white border-2 border-[#E2DDD0] hover:bg-[#F7F5EE] text-[#556047] font-bold rounded-lg text-xs flex items-center justify-center gap-1"
                      data-testid={`mayordomo-edit-${u.id}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      onClick={() => onDelete(u)}
                      className="h-9 px-3 bg-white border-2 border-red-100 hover:bg-red-50 text-red-600 font-bold rounded-lg text-xs flex items-center justify-center"
                      data-testid={`mayordomo-delete-${u.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <MayordomoForm
          editing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { load(); setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function MayordomoForm({ editing, onClose, onSaved }) {
  const [name, setName] = useState(editing?.name || "");
  const [email, setEmail] = useState(editing?.email || "");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(editing?.active !== false);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEdit = !!editing;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nombre requerido");
    if (!isEdit && (!email.trim() || !password.trim())) return toast.error("Correo y contraseña requeridos");
    setSaving(true);
    try {
      if (isEdit) {
        const payload = { name: name.trim(), active };
        if (password.trim()) payload.password = password.trim();
        await api.patch(`/admin/mayordomos/${editing.id}`, payload);
        toast.success(`${name} actualizado`);
      } else {
        await api.post("/admin/mayordomos", {
          email: email.trim().toLowerCase(),
          password: password.trim(),
          name: name.trim(),
          active,
        });
        toast.success(`${name} creado. Comparte el acceso.`);
      }
      onSaved();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose} data-testid="mayordomo-form-modal">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-xl" style={{ fontFamily: "Outfit, sans-serif" }}>
            {isEdit ? "Editar mayordomo" : "Nuevo mayordomo"}
          </h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">Nombre completo *</label>
            <div className="relative">
              <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#889078]" />
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Pedro Hernández"
                className="field-input w-full !pl-9"
                data-testid="mayordomo-name-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">Correo (Gmail) *</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#889078]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isEdit}
                placeholder="mayordomo@gmail.com"
                className="field-input w-full !pl-9 disabled:bg-[#F7F5EE] disabled:text-[#889078]"
                data-testid="mayordomo-email-input"
              />
            </div>
            {isEdit && <p className="text-[11px] text-[#889078] mt-1 font-semibold">El correo no se puede cambiar.</p>}
          </div>

          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1.5 uppercase tracking-wider">
              {isEdit ? "Nueva contraseña (opcional)" : "Contraseña *"}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#889078]" />
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? "Dejar vacío para no cambiar" : "mínimo 6 caracteres"}
                className="field-input w-full !pl-9 !pr-10"
                data-testid="mayordomo-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#889078] hover:text-[#1A2210]"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-5 h-5 accent-[#1D4ED8]"
              data-testid="mayordomo-active-toggle"
            />
            <span className="font-bold text-sm text-[#1A2210]">Cuenta activa</span>
          </label>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-12 rounded-xl bg-white border-2 border-[#E2DDD0] text-[#556047] font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-12 rounded-xl bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              data-testid="mayordomo-save-button"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><UserPlus className="w-4 h-4" /> {isEdit ? "Guardar" : "Crear acceso"}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
