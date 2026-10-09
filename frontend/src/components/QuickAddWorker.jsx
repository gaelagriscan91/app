import { useState } from "react";
import { X, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

/**
 * Modal to quickly create a new worker from anywhere in the app.
 * Props:
 * - open: boolean
 * - onClose(): void
 * - onCreated(worker): called with the created worker (includes qr_code & id)
 */
export default function QuickAddWorker({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [role, setRole] = useState("Cosechador");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setName(""); setLastName(""); setDocumentId(""); setRole("Cosechador");
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!name.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (!lastName.trim()) { toast.error("El apellido es obligatorio"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/workers", {
        name: `${name.trim()} ${lastName.trim()}`,
        document_id: documentId.trim(),
        role,
        active: true,
      });
      toast.success(`${data.name} agregado — QR generado`);
      onCreated?.(data);
      reset();
      onClose?.();
    } catch (e) {
      toast.error("No se pudo guardar el trabajador");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      data-testid="quick-add-worker-modal"
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 w-full sm:max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-extrabold text-[#1A2210] flex items-center gap-2" style={{ fontFamily: "Outfit, sans-serif" }}>
              <UserPlus className="w-5 h-5 text-[#1D4ED8]" /> Nuevo trabajador
            </h3>
            <p className="text-xs text-[#556047] font-semibold mt-0.5">Se genera un QR automáticamente</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#F0EDE1]">
            <X className="w-4 h-4 mx-auto" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (obligatorio)" className="field-input !h-12 !text-base" data-testid="qa-worker-name" />
          </div>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Apellido (obligatorio)" className="field-input !h-12 !text-base" data-testid="qa-worker-last-name" />
          <input value={documentId} onChange={(e) => setDocumentId(e.target.value)} inputMode="numeric" placeholder="SS# (opcional)" className="field-input !h-12 !text-base" data-testid="qa-worker-doc" />
          <div>
            <label className="block text-xs font-bold text-[#1A2210] mb-1 uppercase tracking-wider">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="field-input !h-12 !text-base" data-testid="qa-worker-role">
              <option>Cosechador</option>
              <option>Supervisor</option>
              <option>Chofer</option>
              <option>Empacador</option>
              <option>Otro</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="field-btn-primary disabled:opacity-60"
            data-testid="qa-worker-save"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><UserPlus className="w-5 h-5" /> Guardar y usar</>}
          </button>
        </form>
      </div>
    </div>
  );
}
