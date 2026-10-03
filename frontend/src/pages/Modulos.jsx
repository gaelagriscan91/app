import { useState } from "react";
import { Users, Map, Package, UserCog, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import WorkersTab from "@/components/modules/WorkersTab";
import ParcelsTab from "@/components/modules/ParcelsTab";
import ProductsTab from "@/components/modules/ProductsTab";
import CrewsTab from "@/components/modules/CrewsTab";
import MayordomosTab from "@/components/modules/MayordomosTab";

const baseTabs = [
  { id: "workers", label: "Trabajadores", Icon: Users, testid: "tab-workers" },
  { id: "crews", label: "Cuadrillas", Icon: UserCog, testid: "tab-crews" },
  { id: "parcels", label: "Parcelas", Icon: Map, testid: "tab-parcels" },
  { id: "products", label: "Productos", Icon: Package, testid: "tab-products" },
];

export default function Modulos() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const tabs = isAdmin
    ? [...baseTabs, { id: "mayordomos", label: "Mayordomos", Icon: Shield, testid: "tab-mayordomos" }]
    : baseTabs;
  const [tab, setTab] = useState("workers");
  return (
    <div className="space-y-5" data-testid="modulos-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
          Módulos
        </h1>
        <p className="text-sm text-[#556047] font-semibold">
          Trabajadores, parcelas y productos{isAdmin ? " · Gestión de mayordomos" : ""}
        </p>
      </div>

      <div className="field-card p-1.5 flex gap-1.5 overflow-x-auto">
        {tabs.map(({ id, label, Icon, testid }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            data-testid={testid}
            className={`flex-1 min-w-fit flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-bold text-sm transition-all ${
              tab === id
                ? "bg-[#1E4620] text-white shadow-md"
                : "text-[#556047] hover:bg-[#F0EDE1]"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "workers" && <WorkersTab />}
      {tab === "crews" && <CrewsTab />}
      {tab === "parcels" && <ParcelsTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "mayordomos" && isAdmin && <MayordomosTab />}
    </div>
  );
}
