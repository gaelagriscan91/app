import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Users, Trash2, FileText, Wallet, Shield, LifeBuoy } from "lucide-react-native";
import { useAuth } from "@/src/auth/AuthContext";
import WorkersModule from "@/src/modules/WorkersModule";
import TrashModule from "@/src/modules/TrashModule";
import RegistroModule from "@/src/modules/RegistroModule";
import PayrollModule from "@/src/modules/PayrollModule";
import UsersModule from "@/src/modules/UsersModule";
import SupportModule from "@/src/modules/SupportModule";
import { useTheme, ThemeColors } from "@/src/theme";

export default function ModulosScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { isAdmin } = useAuth();

  const tabs = [
    { id: "workers", label: "Empleados", Icon: Users },
    { id: "trash", label: "Basurero", Icon: Trash2 },
    { id: "registro", label: "Registro", Icon: FileText },
    { id: "payroll", label: "Payroll", Icon: Wallet },
    isAdmin ? { id: "users", label: "Usuarios", Icon: Shield } : { id: "support", label: "Soporte", Icon: LifeBuoy },
  ];
  const [tab, setTab] = useState("workers");

  return (
    <View style={[s.flex, { backgroundColor: colors.surfaceSecondary }]}>
      <Text style={s.title}>Módulos</Text>
      <View style={s.gridCard}>
        {tabs.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <TouchableOpacity key={id} testID={`modulo-tab-${id}`} onPress={() => setTab(id)} style={[s.gridItem, active && s.gridItemActive]} activeOpacity={0.85}>
              <Icon size={18} color={active ? "#FFFFFF" : colors.onSurfaceTertiary} />
              <Text style={[s.gridText, { color: active ? "#FFFFFF" : colors.onSurfaceTertiary }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={s.content}>
        {tab === "workers" && <WorkersModule />}
        {tab === "trash" && <TrashModule />}
        {tab === "registro" && <RegistroModule />}
        {tab === "payroll" && <PayrollModule />}
        {tab === "users" && isAdmin && <UsersModule />}
        {tab === "support" && !isAdmin && <SupportModule />}
      </View>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    title: { fontSize: 30, fontWeight: "800", color: c.onSurface, paddingHorizontal: 20, paddingTop: 16, marginBottom: 14, letterSpacing: -0.5 },
    gridCard: { marginHorizontal: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 10, flexDirection: "row", flexWrap: "wrap" },
    gridItem: { width: "50%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 14 },
    gridItemActive: { backgroundColor: c.brandPrimary },
    gridText: { fontWeight: "800", fontSize: 16 },
    content: { flex: 1, marginTop: 8 },
  });
