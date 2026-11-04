import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { Card, EmptyState, Loading } from "@/src/components/ui";
import { formatCurrency } from "@/src/utils/format";
import { useTheme, ThemeColors } from "@/src/theme";

export default function RegistroModule() {
  const { colors } = useTheme();
  const s = styles(colors);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["receipts-history"], queryFn: async () => (await api.get("/receipts/history")).data as any[] });
  const rows = q.data || [];

  const del = async (id: string) => {
    try { await api.delete(`/receipts/history/${id}`); toast.success("Movido al basurero"); qc.invalidateQueries({ queryKey: ["receipts-history"] }); qc.invalidateQueries({ queryKey: ["trash"] }); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.hint}>Recibos guardados antes de borrar historial.</Text>
      {q.isLoading ? <Loading /> : rows.length === 0 ? <EmptyState text="Aún no guardas recibos" /> : rows.map((r) => (
        <Card key={r.id} style={s.row} testID={`registro-${r.id}`}>
          <View style={s.flex}>
            <Text style={s.name}>{r.date_from} → {r.date_to}</Text>
            <Text style={s.sub}>{r.note || "Recibo guardado"} · {r.saved_by_name || ""}</Text>
          </View>
          <Text style={s.pay}>{formatCurrency(r.total_payment)}</Text>
          <TouchableOpacity testID={`registro-delete-${r.id}`} onPress={() => del(r.id)} style={s.iconBtn}><Trash2 size={18} color={colors.error} /></TouchableOpacity>
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
    hint: { color: c.onSurfaceTertiary, fontWeight: "600", fontSize: 13, marginBottom: 12 },
    row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, paddingVertical: 12 },
    name: { fontWeight: "800", color: c.onSurface, fontSize: 15 },
    sub: { fontSize: 12, color: c.muted, marginTop: 2 },
    pay: { fontWeight: "800", color: c.brandPrimary, fontSize: 15 },
    iconBtn: { padding: 8 },
  });
