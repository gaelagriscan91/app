import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { EmptyState, FlatGroup, FlatRow, Loading } from "@/src/components/ui";
import { formatCurrency } from "@/src/utils/format";
import { useTheme, ThemeColors } from "@/src/theme";

export default function TrashModule() {
  const { colors } = useTheme();
  const s = styles(colors);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["trash"], queryFn: async () => (await api.get("/receipts/trash")).data as any[] });
  const rows = q.data || [];

  const restore = async (id: string) => {
    try { await api.post(`/receipts/trash/${id}/restore`); toast.success("Recibo restaurado"); qc.invalidateQueries({ queryKey: ["trash"] }); qc.invalidateQueries({ queryKey: ["receipts-history"] }); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const purge = async (id: string) => {
    try { await api.delete(`/receipts/trash/${id}`); toast.success("Eliminado definitivamente"); qc.invalidateQueries({ queryKey: ["trash"] }); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.hint}>Los recibos borrados se guardan 60 días antes de eliminarse.</Text>
      {q.isLoading ? <Loading /> : rows.length === 0 ? <EmptyState text="El basurero está vacío" /> : <FlatGroup style={s.flatList}>{rows.map((r) => (
        <FlatRow key={r.id} style={s.flatRow} testID={`trash-${r.id}`}>
          <View style={s.flex}>
            <Text style={s.name}>{r.date_from} → {r.date_to}</Text>
            <Text style={s.sub}>{formatCurrency(r.total_payment)} · borrado {(r.deleted_at || "").slice(0, 10)}</Text>
          </View>
          <TouchableOpacity testID={`trash-restore-${r.id}`} onPress={() => restore(r.id)} style={s.iconBtn}><RotateCcw size={18} color={colors.brandPrimary} /></TouchableOpacity>
          <TouchableOpacity testID={`trash-purge-${r.id}`} onPress={() => purge(r.id)} style={s.iconBtn}><Trash2 size={18} color={colors.error} /></TouchableOpacity>
        </FlatRow>
      ))}</FlatGroup>}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: { padding: 16 },
    hint: { color: c.onSurfaceTertiary, fontWeight: "600", fontSize: 13, marginBottom: 12 },
    row: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, paddingVertical: 12 },
    flatList: { marginHorizontal: -16 },
    flatRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    name: { fontWeight: "800", color: c.onSurface, fontSize: 15 },
    sub: { fontSize: 12, color: c.muted, marginTop: 2 },
    iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  });
