import React, { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { toast } from "@/src/components/Toast";
import { Card, EmptyState, Loading } from "@/src/components/ui";
import ChangePasswordCard from "@/src/components/ChangePasswordCard";
import { useTheme, ThemeColors } from "@/src/theme";

export default function UsersModule() {
  const { colors } = useTheme();
  const s = styles(colors);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [creating, setCreating] = useState(false);

  const q = useQuery({ queryKey: ["mayordomos"], queryFn: async () => (await api.get("/admin/mayordomos")).data as any[] });
  const rows = q.data || [];

  const create = async () => {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) { toast.error("Nombre, correo y contraseña (6+)"); return; }
    setCreating(true);
    try {
      await api.post("/admin/mayordomos", { ...form, role: "user", active: true });
      toast.success("Mayordomo creado"); setForm({ name: "", email: "", password: "" });
      qc.invalidateQueries({ queryKey: ["mayordomos"] });
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setCreating(false); }
  };
  const toggle = async (u: any) => {
    try { await api.patch(`/admin/mayordomos/${u.id}`, { active: !u.active }); qc.invalidateQueries({ queryKey: ["mayordomos"] }); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (u: any) => {
    try { await api.delete(`/admin/mayordomos/${u.id}`); toast.success("Usuario eliminado"); qc.invalidateQueries({ queryKey: ["mayordomos"] }); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <ChangePasswordCard />
      <Card style={{ marginBottom: 14 }}>
        <Text style={s.title}>Nuevo mayordomo</Text>
        <TextInput testID="mayordomo-name" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} placeholder="Nombre" placeholderTextColor={colors.muted} style={[s.input, { marginBottom: 10 }]} />
        <TextInput testID="mayordomo-email" value={form.email} onChangeText={(t) => setForm({ ...form, email: t })} placeholder="Correo" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" style={[s.input, { marginBottom: 10 }]} />
        <TextInput testID="mayordomo-password" value={form.password} onChangeText={(t) => setForm({ ...form, password: t })} placeholder="Contraseña (mín. 6)" placeholderTextColor={colors.muted} secureTextEntry autoCapitalize="none" style={[s.input, { marginBottom: 12 }]} />
        <TouchableOpacity testID="mayordomo-create" onPress={create} disabled={creating} style={s.createBtn}><Plus size={18} color="#FFFFFF" /><Text style={s.createText}>{creating ? "..." : "Crear mayordomo"}</Text></TouchableOpacity>
      </Card>

      {q.isLoading ? <Loading /> : rows.length === 0 ? <EmptyState text="Sin usuarios" /> : rows.map((u) => (
        <Card key={u.id} style={s.row} testID={`user-${u.id}`}>
          <View style={s.flex}>
            <Text style={s.name}>{u.name} {u.role === "admin" ? "· admin" : ""}</Text>
            <Text style={s.sub}>{u.email} · {u.active ? "activo" : "bloqueado"}</Text>
          </View>
          {u.id !== user?.id && u.role !== "admin" && (
            <>
              <Switch testID={`user-toggle-${u.id}`} value={!!u.active} onValueChange={() => toggle(u)} trackColor={{ true: colors.success }} />
              <TouchableOpacity testID={`user-delete-${u.id}`} onPress={() => del(u)} style={s.iconBtn}><Trash2 size={18} color={colors.error} /></TouchableOpacity>
            </>
          )}
        </Card>
      ))}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: { padding: 16 },
    title: { fontSize: 15, fontWeight: "800", color: c.onSurface, marginBottom: 10 },
    input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, height: 48, paddingHorizontal: 14, fontSize: 15, color: c.onSurface },
    createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.brandSecondary, height: 48, borderRadius: 12 },
    createText: { color: "#FFFFFF", fontWeight: "800" },
    row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10, paddingVertical: 12 },
    name: { fontWeight: "800", color: c.onSurface, fontSize: 15 },
    sub: { fontSize: 12, color: c.muted, marginTop: 2 },
    iconBtn: { padding: 6 },
  });
