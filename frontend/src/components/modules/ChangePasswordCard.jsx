import { useState } from "react";
import { KeyRound, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";

export default function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setCurrent(""); setNext(""); setConfirm(""); setOpen(false); };

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 6) return toast.error("La nueva contraseña debe tener al menos 6 caracteres");
    if (next !== confirm) return toast.error("Las contraseñas nuevas no coinciden");
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Contraseña actualizada");
      reset();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "No se pudo cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  };

  const type = show ? "text" : "password";
  return (
    <div className="field-card p-5" data-testid="change-password-card">
      {!open ? (
        <button onClick={() => setOpen(true)} className="w-full h-12 rounded-xl border-2 border-[#1D4ED8] text-[#1D4ED8] font-bold flex items-center justify-center gap-2 hover:bg-[#EEF2FF] transition-colors" data-testid="change-password-open">
          <KeyRound className="w-5 h-5" /> Restablecer contraseña
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>Restablecer contraseña</div>
            <button type="button" onClick={() => setShow((v) => !v)} className="p-1.5 text-[#556047]" aria-label="Mostrar contraseñas" data-testid="change-password-toggle">
              {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <input type={type} value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" placeholder="Contraseña actual" className="field-input !h-12 w-full" data-testid="change-password-current" />
          <input type={type} value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" placeholder="Nueva contraseña (mín. 6)" className="field-input !h-12 w-full" data-testid="change-password-new" />
          <input type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" placeholder="Repite la nueva contraseña" className="field-input !h-12 w-full" data-testid="change-password-confirm" />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={reset} disabled={saving} className="h-12 rounded-xl bg-[#F0EDE1] text-[#556047] font-bold" data-testid="change-password-cancel">Cancelar</button>
            <button type="submit" disabled={saving} className="h-12 rounded-xl bg-[#1D4ED8] hover:bg-[#1E3A8A] text-white font-bold flex items-center justify-center transition-colors disabled:opacity-60" data-testid="change-password-save">
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Guardar"}
            </button>
          </div>
          <p className="text-xs text-[#889078] font-semibold text-center">¿No recuerdas la actual? Cierra sesión y usa “¿Olvidaste?” en la entrada.</p>
        </form>
      )}
    </div>
  );
}
