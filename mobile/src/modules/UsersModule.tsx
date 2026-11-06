import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Mail, Shield, Ban, CheckCircle2, Pencil, Eye, EyeOff, Loader } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { Card, EmptyState, FlatGroup, FlatRow, Loading } from "@/src/components/ui";
import ChangePasswordCard from "@/src/components/ChangePasswordCard";
import { useTheme, ThemeColors } from "@/src/theme";

const UNLOCK_DAYS = [3, 7, 15, 30];

const isExpired = (u: any) => u.access_expires_at && new Date(u.access_expires_at).getTime() <= Date.now();
const daysLeft = (u: any) => {
  if (!u.access_expires_at || isExpired(u)) return null;
  return Math.max(1, Math.ceil((new Date(u.access_expires_at).getTime() - Date.now()) / 86400000));
};
const statusOf = (u: any) => {
  if (u.active === false || isExpired(u)) return { label: "Bloqueado", bg: "#889078", fg: "#FFFFFF" };
  if (u.unlocked_by === "trial") return { label: "Prueba gratis", bg: "#059669", fg: "#FFFFFF" };
  if (u.unlocked_by === "paypal") return { label: "Pagado", bg: "#FFC439", fg: "#003087" };
  return { label: "Activo", bg: "#2563EB", fg: "#FFFFFF" };
};

export default function UsersModule() {
  const { colors } = useTheme();
  const s = styles(colors);
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const q = useQuery({ queryKey: ["mayordomos"], queryFn: async () => (await api.get("/admin/mayordomos")).data as any[] });
  const rows = (q.data || []).filter((u) => u.role !== "admin");

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

  const startEdit = (u: any) => {
    setUnlocking(null);
    setEditForm({ email: u.email, password: "" });
    setShowPw(false);
    setEditing(editing === u.id ? null : u.id);
  };

  const saveEdit = async (u: any) => {
    const email = editForm.email.trim();
    if (!email) return toast.error("Escribe el correo");
    if (editForm.password && editForm.password.length < 6) return toast.error("La contraseña debe tener al menos 6 caracteres");
    const payload: any = { name: u.name };
    if (email.toLowerCase() !== u.email) payload.email = email;
    if (editForm.password) payload.password = editForm.password;
    if (!payload.email && !payload.password) { setEditing(null); return; }
    setSaving(true);
    try {
      await api.patch(`/admin/mayordomos/${u.id}`, payload);
      toast.success("Usuario actualizado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["mayordomos"] });
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setSaving(false); }
  };

  const unlockFor = async (u: any, days: number) => {
    try {
      await api.patch(`/admin/mayordomos/${u.id}`, { active: true, name: u.name, access_days: days });
      toast.success(`${u.name} desbloqueado por ${days} días`);
      setUnlocking(null);
      qc.invalidateQueries({ queryKey: ["mayordomos"] });
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const onToggleBlock = async (u: any) => {
    const willBlock = u.active !== false && !isExpired(u);
    if (!willBlock) { setEditing(null); setUnlocking(unlocking === u.id ? null : u.id); return; }
    try {
      await api.patch(`/admin/mayordomos/${u.id}`, { active: false, name: u.name });
      toast.success(`${u.name} bloqueado`);
      qc.invalidateQueries({ queryKey: ["mayordomos"] });
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const onDelete = async (u: any) => {
    try {
      await api.delete(`/admin/mayordomos/${u.id}`);
      toast.success("Cuenta eliminada");
      qc.invalidateQueries({ queryKey: ["mayordomos"] });
    } catch (e) { toast.error(apiErrorMessage(e)); }
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

      <Text style={s.sectionTitle}>Usuarios ({rows.length})</Text>

      {q.isLoading ? <Loading /> : rows.length === 0 ? (
        <FlatGroup style={s.flatList}>
          <FlatRow style={s.emptyRow}>
            <Shield size={38} color={colors.muted} />
            <Text style={s.emptyText}>Aún no hay usuarios registrados</Text>
          </FlatRow>
        </FlatGroup>
      ) : <FlatGroup style={s.flatList}>{rows.map((u) => {
        const st = statusOf(u);
        const blocked = u.active === false || isExpired(u);
        const left = daysLeft(u);
        return (
          <FlatRow key={u.id} testID={`mayordomo-row-${u.id}`}>
            <View style={s.headRow}>
              <Text style={s.name} numberOfLines={1}>{u.name}</Text>
              <View style={[s.badge, { backgroundColor: st.bg }]} testID={`mayordomo-status-${u.id}`}><Text style={[s.badgeText, { color: st.fg }]}>{st.label}</Text></View>
            </View>
            <View style={s.mailRow}><Mail size={13} color={colors.onSurfaceTertiary} /><Text style={s.email} numberOfLines={1}>{u.email}</Text></View>
            {left && !blocked ? <Text style={s.daysLeft} testID={`mayordomo-days-left-${u.id}`}>Se bloquea en {left} día{left !== 1 ? "s" : ""}</Text> : null}

            <View style={s.actionRow}>
              <TouchableOpacity onPress={() => onToggleBlock(u)} testID={`mayordomo-toggle-block-${u.id}`} style={[s.toggleBtn, blocked ? s.unblockBtn : s.blockBtn]}>
                {blocked ? <CheckCircle2 size={16} color="#047857" /> : <Ban size={16} color="#B45309" />}
                <Text style={[s.toggleText, { color: blocked ? "#047857" : "#B45309" }]}>{blocked ? "Desbloquear" : "Bloquear"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => startEdit(u)} testID={`mayordomo-edit-${u.id}`} style={s.sqBtnBlue}><Pencil size={16} color={colors.brandPrimary} /></TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(u)} testID={`mayordomo-delete-${u.id}`} style={s.sqBtnRed}><Trash2 size={16} color={colors.error} /></TouchableOpacity>
            </View>

            {editing === u.id && (
              <View style={s.editBox} testID={`mayordomo-edit-form-${u.id}`}>
                <Text style={s.editTitle}>Editar correo y contraseña</Text>
                <TextInput value={editForm.email} onChangeText={(t) => setEditForm({ ...editForm, email: t })} placeholder="Correo" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" style={[s.input, { marginBottom: 8 }]} testID={`mayordomo-edit-email-${u.id}`} />
                <View style={s.pwWrap}>
                  <TextInput value={editForm.password} onChangeText={(t) => setEditForm({ ...editForm, password: t })} placeholder="Nueva contraseña (vacío = no cambiar)" placeholderTextColor={colors.muted} secureTextEntry={!showPw} autoCapitalize="none" style={[s.input, { flex: 1, paddingRight: 44 }]} testID={`mayordomo-edit-password-${u.id}`} />
                  <TouchableOpacity onPress={() => setShowPw((v) => !v)} style={s.eyeBtn} testID={`mayordomo-edit-toggle-${u.id}`}>{showPw ? <EyeOff size={18} color={colors.onSurfaceTertiary} /> : <Eye size={18} color={colors.onSurfaceTertiary} />}</TouchableOpacity>
                </View>
                <View style={s.editBtns}>
                  <TouchableOpacity onPress={() => setEditing(null)} disabled={saving} style={s.cancelBtn} testID={`mayordomo-edit-cancel-${u.id}`}><Text style={s.cancelText}>Cancelar</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => saveEdit(u)} disabled={saving} style={s.saveBtn} testID={`mayordomo-edit-save-${u.id}`}>{saving ? <Loader size={16} color="#FFFFFF" /> : <Text style={s.saveText}>Guardar</Text>}</TouchableOpacity>
                </View>
              </View>
            )}

            {unlocking === u.id && (
              <View style={s.unlockBox} testID={`mayordomo-unlock-days-${u.id}`}>
                <Text style={s.unlockTitle}>¿Cuántos días desbloqueado?</Text>
                <View style={s.daysGrid}>
                  {UNLOCK_DAYS.map((d) => (
                    <TouchableOpacity key={d} onPress={() => unlockFor(u, d)} style={s.dayBtn} testID={`mayordomo-unlock-${d}-${u.id}`}>
                      <Text style={s.dayText}>{d} días</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </FlatRow>
        );
      })}</FlatGroup>}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    scroll: { padding: 16 },
    title: { fontSize: 15, fontWeight: "800", color: c.onSurface, marginBottom: 10 },
    input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, height: 48, paddingHorizontal: 14, fontSize: 15, color: c.onSurface },
    createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.brandSecondary, height: 48, borderRadius: 12 },
    createText: { color: "#FFFFFF", fontWeight: "800" },
    sectionTitle: { fontSize: 17, fontWeight: "800", color: c.onSurface, marginBottom: 12 },
    emptyCard: { alignItems: "center", gap: 8, paddingVertical: 32, backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border },
    emptyText: { color: c.onSurfaceTertiary, fontWeight: "700" },
    flatList: { marginHorizontal: -16 },
    emptyRow: { alignItems: "center", gap: 8, paddingVertical: 32 },
    headRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    name: { fontWeight: "800", color: c.onSurface, fontSize: 16, flexShrink: 1 },
    badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
    badgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
    mailRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
    email: { fontSize: 12, color: c.onSurfaceTertiary, fontWeight: "600", flexShrink: 1 },
    daysLeft: { fontSize: 11, fontWeight: "800", color: "#B45309", marginTop: 3 },
    actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
    toggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 12, borderWidth: 1.5 },
    blockBtn: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
    unblockBtn: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
    toggleText: { fontWeight: "800", fontSize: 14 },
    sqBtnBlue: { width: 48, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: "#DBEAFE", backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
    sqBtnRed: { width: 48, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: "#FEE2E2", backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
    editBox: { marginTop: 12, borderRadius: 14, backgroundColor: "#EEF2FF", borderWidth: 1.5, borderColor: "#C7D2FE", padding: 12 },
    editTitle: { fontSize: 12, fontWeight: "800", color: "#1E3A8A", marginBottom: 8 },
    pwWrap: { position: "relative", justifyContent: "center" },
    eyeBtn: { position: "absolute", right: 10, padding: 4 },
    editBtns: { flexDirection: "row", gap: 10, marginTop: 10 },
    cancelBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border, alignItems: "center", justifyContent: "center" },
    cancelText: { color: c.onSurfaceTertiary, fontWeight: "800" },
    saveBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
    saveText: { color: "#FFFFFF", fontWeight: "800" },
    unlockBox: { marginTop: 12, borderRadius: 14, backgroundColor: "#ECFDF5", borderWidth: 1.5, borderColor: "#A7F3D0", padding: 12 },
    unlockTitle: { fontSize: 12, fontWeight: "800", color: "#065F46", marginBottom: 10 },
    daysGrid: { flexDirection: "row", gap: 8 },
    dayBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1.5, borderColor: "#6EE7B7", alignItems: "center", justifyContent: "center" },
    dayText: { color: "#047857", fontWeight: "900", fontSize: 13 },
  });
