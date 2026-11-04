import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
        {tabs.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <TouchableOpacity key={id} testID={`modulo-tab-${id}`} onPress={() => setTab(id)} style={[s.tab, active && s.tabActive]}>
              <Icon size={15} color={active ? "#FFFFFF" : colors.onSurfaceTertiary} />
              <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={s.flex}>
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
    tabBar: { paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
    tab: { flexDirection: "row", alignItems: "center", gap: 6, height: 42, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    tabActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
    tabText: { fontWeight: "700", color: c.onSurfaceTertiary, fontSize: 13 },
    tabTextActive: { color: "#FFFFFF" },
  });
