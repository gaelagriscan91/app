import { useEffect, useState } from "react";
import { Loader2, Mail, Shield, Trash2, Ban, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "@/lib/api";

function statusOf(u) {
  if (u.active === false) return { label: "Bloqueado", cls: "bg-[#889078] text-white" };
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

  const onToggleBlock = async (u) => {
    const willBlock = u.active !== false;
    if (!window.confirm(`¿${willBlock ? "Bloquear" : "Desbloquear"} a ${u.name}?`)) return;
    try {
      await api.patch(`/admin/mayordomos/${u.id}`, { active: !willBlock, name: u.name });
      toast.success(willBlock ? `${u.name} bloqueado` : `${u.name} desbloqueado`);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo actualizar");
    }
  };

  const onDelete = async (u) => {
    if (!window.confirm(`¿Eliminar la cuenta de ${u.name}? Se borrará la cuenta y toda su información. No se puede deshacer.`)) return;
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
            const isBlocked = u.active === false;
            return (
              <div key={u.id} className="field-card p-4" data-testid={`mayordomo-row-${u.id}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-[#1A2210] truncate text-base" style={{ fontFamily: "Outfit, sans-serif" }}>{u.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${st.cls}`} data-testid={`mayordomo-status-${u.id}`}>{st.label}</span>
                </div>
                <p className="text-xs text-[#556047] font-semibold truncate flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" /> {u.email}</p>
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
                    onClick={() => onDelete(u)}
                    className="h-10 px-3 bg-white border-2 border-red-100 hover:bg-red-50 text-red-600 font-bold rounded-lg flex items-center justify-center transition-colors"
                    data-testid={`mayordomo-delete-${u.id}`}
                    aria-label="Eliminar cuenta"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
