import { useState } from "react";
import { Users, Trash2, Shield, FileText, LifeBuoy } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import WorkersTab from "@/components/modules/WorkersTab";
import BasureroTab from "@/components/modules/BasureroTab";
import MayordomosTab from "@/components/modules/MayordomosTab";
import RegistroTab from "@/components/modules/RegistroTab";
import SubscriptionTab from "@/components/modules/SubscriptionTab";

const baseTabs = [
  { id: "workers", label: "Empleados", Icon: Users, testid: "tab-workers" },
  { id: "trash", label: "Basurero", Icon: Trash2, testid: "tab-trash" },
  { id: "registro", label: "Registro", Icon: FileText, testid: "tab-registro" },
];

export default function Modulos() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const tabs = isAdmin
    ? [...baseTabs, { id: "mayordomos", label: "Usuarios", Icon: Shield, testid: "tab-mayordomos" }]
    : [...baseTabs, { id: "plan", label: "Soporte", Icon: LifeBuoy, testid: "tab-plan" }];
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "workers");
  return (
    <div className="space-y-5" data-testid="modulos-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
          Módulos
        </h1>
      </div>

      <div className="field-card p-1.5 grid grid-cols-2 sm:flex gap-1.5">
        {tabs.map(({ id, label, Icon, testid }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            data-testid={testid}
            className={`sm:flex-1 flex items-center justify-center gap-2 h-11 px-3 rounded-xl font-bold text-sm transition-all ${
              tab === id
                ? "bg-[#1D4ED8] text-white shadow-md"
                : "text-[#556047] hover:bg-[#F0EDE1]"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "workers" && <WorkersTab />}
      {tab === "trash" && <BasureroTab />}
      {tab === "registro" && <RegistroTab />}
      {tab === "mayordomos" && isAdmin && <MayordomosTab />}
      {tab === "plan" && !isAdmin && <SubscriptionTab />}
    </div>
  );
}
