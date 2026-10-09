import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, ArrowRight } from "lucide-react";
import api from "@/lib/api";

// Admin-only notice: self-registered mayordomos waiting to be unblocked
export default function PendingMayordomosNotice() {
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);

  useEffect(() => {
    api.get("/admin/mayordomos")
      .then(({ data }) => setPending((data || []).filter((u) => u.self_registered && u.active === false && u.role !== "admin")))
      .catch(() => {});
  }, []);

  if (pending.length === 0) return null;
  return (
    <button
      onClick={() => navigate("/modulos?tab=mayordomos")}
      className="w-full text-left rounded-2xl bg-[#FEF3C7] border-2 border-[#F59E0B] px-4 py-3.5 flex items-center gap-3 hover:bg-[#FDE68A] transition-colors animate-in fade-in slide-in-from-top-2 duration-300"
      data-testid="pending-mayordomos-notice"
    >
      <div className="relative w-11 h-11 rounded-xl bg-[#F59E0B] flex items-center justify-center shrink-0">
        <UserPlus className="w-5 h-5 text-white" />
        <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-extrabold flex items-center justify-center" data-testid="pending-mayordomos-count">
          {pending.length}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-extrabold text-[#92400E] text-sm">
          {pending.length === 1 ? "1 mayordomo nuevo espera desbloqueo" : `${pending.length} mayordomos nuevos esperan desbloqueo`}
        </div>
        <div className="text-xs text-[#92400E]/80 font-semibold truncate">
          {pending.slice(0, 3).map((u) => u.name || u.email).join(", ")}{pending.length > 3 ? "…" : ""}
        </div>
      </div>
      <ArrowRight className="w-5 h-5 text-[#92400E] shrink-0" />
    </button>
  );
}
