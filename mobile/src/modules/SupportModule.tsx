import React from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LifeBuoy, Mail, LogOut } from "lucide-react-native";
import { useAuth } from "@/src/auth/AuthContext";
import { Card } from "@/src/components/ui";
import ChangePasswordCard from "@/src/components/ChangePasswordCard";
import { useTheme, ThemeColors } from "@/src/theme";

export default function SupportModule() {
  const { colors } = useTheme();
  const s = styles(colors);
  const { user, logout } = useAuth();

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Card style={{ marginBottom: 14 }}>
        <View style={s.head}><LifeBuoy size={20} color={colors.brandPrimary} /><Text style={s.title}>Soporte</Text></View>
        <Text style={s.body}>¿Necesitas ayuda con AgriScan? Escríbenos y con gusto te apoyamos.</Text>
        <TouchableOpacity testID="support-email" onPress={() => Linking.openURL("mailto:gaelagriscan@gmail.com")} style={s.mailBtn}>
          <Mail size={16} color="#FFFFFF" /><Text style={s.mailText}>gaelagriscan@gmail.com</Text>
        </TouchableOpacity>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <Text style={s.label}>Tu cuenta</Text>
        <Text style={s.acc}>{user?.name}</Text>
        <Text style={s.accSub}>{user?.email}</Text>
      </Card>

      <ChangePasswordCard />

      <TouchableOpacity testID="support-logout" onPress={logout} style={s.logout}>
        <LogOut size={18} color={colors.error} /><Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    scroll: { padding: 16 },
    head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    title: { fontSize: 16, fontWeight: "800", color: c.onSurface },
    body: { color: c.onSurfaceTertiary, fontWeight: "600", fontSize: 14, marginBottom: 14, lineHeight: 20 },
    mailBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.brandPrimary, height: 48, borderRadius: 12 },
    mailText: { color: "#FFFFFF", fontWeight: "800" },
    label: { fontSize: 11, color: c.muted, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
    acc: { fontSize: 16, fontWeight: "800", color: c.onSurface },
    accSub: { fontSize: 13, color: c.onSurfaceTertiary, marginTop: 2 },
    logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FEF2F2", height: 50, borderRadius: 14, borderWidth: 1, borderColor: "#FECACA" },
    logoutText: { color: c.error, fontWeight: "800", fontSize: 15 },
  });
