import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogOut, Lock, Gift, CloudOff, RefreshCw, CheckCircle2 } from "lucide-react-native";
import { useAuth } from "@/src/auth/AuthContext";
import { useOffline } from "@/src/offline/OfflineContext";
import { useTheme } from "@/src/theme";
import Logo from "@/src/components/Logo";

function trialLeft(endsAt?: string | null): string {
  if (!endsAt) return "";
  const ms = new Date(endsAt).getTime() - Date.now();
  const days = Math.max(0, Math.floor(ms / 86400000));
  const hours = Math.max(0, Math.floor((ms % 86400000) / 3600000));
  return days > 0 ? `${days} día${days !== 1 ? "s" : ""}${hours ? ` ${hours} h` : ""}` : `${hours} h`;
}

export default function AppHeader() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, blocked, logout } = useAuth();
  const { online, pending, syncing, sync } = useOffline();

  return (
    <View>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.brandPrimary }]}>
        <View style={styles.left}>
          <Logo size={40} light />
          <View>
            <Text style={styles.brand}>AgriScan</Text>
            <Text style={styles.sub}>Control de cosechas</Text>
          </View>
        </View>
        <View style={styles.right}>
          {user?.role === "admin" && (
            <View style={styles.adminBadge} testID="admin-badge">
              <Text style={styles.adminText}>ADMIN</Text>
            </View>
          )}
          <TouchableOpacity testID="logout-button" onPress={logout} style={styles.logout}>
            <LogOut size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {blocked ? (
        <View style={[styles.banner, { backgroundColor: "#FEF3C7", borderBottomColor: colors.warning }]} testID="blocked-banner">
          <Lock size={15} color="#92400E" />
          <Text style={[styles.bannerText, { color: "#92400E" }]}>
            {user?.trial_used ? "Tu prueba gratis terminó — solo puedes ver" : "Cuenta bloqueada — solo puedes ver"}
          </Text>
        </View>
      ) : user?.trial_ends_at ? (
        <View style={[styles.banner, { backgroundColor: "#ECFDF5", borderBottomColor: colors.success }]} testID="trial-banner">
          <Gift size={15} color="#065F46" />
          <Text style={[styles.bannerText, { color: "#065F46" }]}>
            Prueba gratis: quedan {trialLeft(user.trial_ends_at)}
          </Text>
        </View>
      ) : null}

      {!online ? (
        <View style={[styles.offlineBar, { backgroundColor: "#FEF3C7" }]} testID="offline-bar">
          <CloudOff size={15} color="#92400E" />
          <Text style={[styles.offlineText, { color: "#92400E" }]}>
            Sin conexión{pending > 0 ? ` · ${pending} pendiente${pending !== 1 ? "s" : ""}` : " · trabajando sin señal"}
          </Text>
        </View>
      ) : pending > 0 ? (
        <TouchableOpacity testID="sync-button" onPress={() => sync()} disabled={syncing} style={[styles.offlineBar, { backgroundColor: "#DBEAFE" }]}>
          <RefreshCw size={15} color="#1E40AF" />
          <Text style={[styles.offlineText, { color: "#1E40AF", flex: 1 }]}>
            {syncing ? "Sincronizando…" : `${pending} registro${pending !== 1 ? "s" : ""} por subir`}
          </Text>
          {!syncing && <Text style={styles.syncAction}>Sincronizar</Text>}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  left: { flexDirection: "row", alignItems: "center", gap: 10 },
  brand: { color: "#FFFFFF", fontWeight: "800", fontSize: 18, letterSpacing: -0.3 },
  sub: { color: "#C7D7F5", fontSize: 11 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  adminBadge: { backgroundColor: "#2563EB", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  adminText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  logout: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#1E3A8A", alignItems: "center", justifyContent: "center" },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 2 },
  bannerText: { fontWeight: "700", fontSize: 13, flex: 1 },
  offlineBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 9 },
  offlineText: { fontWeight: "700", fontSize: 13 },
  syncAction: { color: "#1E40AF", fontWeight: "900", fontSize: 13, textDecorationLine: "underline" },
});
