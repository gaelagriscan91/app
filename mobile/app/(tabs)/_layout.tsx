import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ClipboardList, ScanLine, CalendarCheck, FileSpreadsheet, Boxes } from "lucide-react-native";
import { useAuth } from "@/src/auth/AuthContext";
import { useTheme } from "@/src/theme";
import AppHeader from "@/src/components/AppHeader";

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        header: () => <AppHeader />,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, height: 62, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen name="registrar" options={{ title: "Cosechar", tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }} />
      <Tabs.Screen name="asistencia" options={{ title: "Asistencia", tabBarIcon: ({ color, size }) => <ScanLine color={color} size={size} /> }} />
      <Tabs.Screen name="dia" options={{ title: "Día", tabBarIcon: ({ color, size }) => <CalendarCheck color={color} size={size} /> }} />
      <Tabs.Screen name="reportes" options={{ title: "Reportes", tabBarIcon: ({ color, size }) => <FileSpreadsheet color={color} size={size} /> }} />
      <Tabs.Screen name="modulos" options={{ title: "Módulos", tabBarIcon: ({ color, size }) => <Boxes color={color} size={size} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center" } });
