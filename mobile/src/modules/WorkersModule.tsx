import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, RefreshCw } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { Card, EmptyState, Loading } from "@/src/components/ui";
import { useTheme, ThemeColors } from "@/src/theme";

export default function WorkersModule() {
  const { colors } = useTheme();
  const s = styles(colors);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const q = useQuery({ queryKey: ["workers"], queryFn: async () => (await api.get("/workers")).data as any[] });
  const workers = q.data || [];

  const add = async () => {
    if (!name.trim()) return;
    setAdding(true);
    try { await api.post("/workers", { name: name.trim() }); setName(""); toast.success("Empleado agregado"); qc.invalidateQueries({ queryKey: ["workers"] }); }
    catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setAdding(false); }
  };
  const remove = async (w: any) => {
    try { await api.delete(`/workers/${w.id}`); toast.success("Empleado eliminado"); qc.invalidateQueries({ queryKey: ["workers"] }); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const regen = async (w: any) => {
    try { const { data } = await api.post(`/workers/${w.id}/regenerate-qr`); toast.success("QR regenerado"); qc.invalidateQueries({ queryKey: ["workers"] }); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Card style={{ marginBottom: 14 }}>
        <Text style={s.title}>Nuevo empleado</Text>
        <View style={s.addRow}>
          <TextInput testID="worker-name-input" value={name} onChangeText={setName} placeholder="Nombre completo" placeholderTextColor={colors.muted} style={s.input} />
          <TouchableOpacity testID="worker-add-button" onPress={add} disabled={adding} style={s.addBtn}><Plus size={22} color="#FFFFFF" /></TouchableOpacity>
        </View>
      </Card>

      {q.isLoading ? <Loading /> : workers.length === 0 ? <EmptyState text="Aún no tienes empleados" /> : workers.map((w) => (
        <Card key={w.id} style={s.row} testID={`worker-${w.id}`}>
          <View style={s.flex}>
            <Text style={s.name}>{w.name}</Text>
            <Text style={s.qr}>{w.qr_code}</Text>
          </View>
          <TouchableOpacity testID={`worker-regen-${w.id}`} onPress={() => regen(w)} style={s.iconBtn}><RefreshCw size={18} color={colors.brandPrimary} /></TouchableOpacity>
          <TouchableOpacity testID={`worker-delete-${w.id}`} onPress={() => remove(w)} style={s.iconBtn}><Trash2 size={18} color={colors.error} /></TouchableOpacity>
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
    addRow: { flexDirection: "row", gap: 10 },
    input: { flex: 1, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, height: 50, paddingHorizontal: 14, fontSize: 16, color: c.onSurface },
    addBtn: { width: 50, height: 50, borderRadius: 12, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
    row: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, paddingVertical: 12 },
    name: { fontWeight: "800", color: c.onSurface, fontSize: 15 },
    qr: { fontSize: 12, color: c.muted, marginTop: 2, fontVariant: ["tabular-nums"] },
    iconBtn: { padding: 8 },
  });
