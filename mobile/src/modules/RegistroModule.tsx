import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, X, Users, Clock, FileText, ChevronRight, Calendar } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { Card, EmptyState, Loading } from "@/src/components/ui";
import { formatCurrency, formatNumber } from "@/src/utils/format";
import { useTheme, ThemeColors } from "@/src/theme";

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  try { return new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
};
const fmtDateTime = (iso?: string) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
};
const uniq = (arr: any[]) => [...new Set(arr)];

export default function RegistroModule() {
  const { colors } = useTheme();
  const s = styles(colors);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["receipts-history"], queryFn: async () => (await api.get("/receipts/history")).data as any[] });
  const rows = q.data || [];

  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = async (id: string) => {
    setSelected({ _loading: true });
    setDetailLoading(true);
    try { const { data } = await api.get(`/receipts/history/${id}`); setSelected(data); }
    catch (e) { toast.error(apiErrorMessage(e)); setSelected(null); }
    finally { setDetailLoading(false); }
  };

  const del = async (id: string) => {
    try { await api.delete(`/receipts/history/${id}`); toast.success("Movido al basurero"); qc.invalidateQueries({ queryKey: ["receipts-history"] }); qc.invalidateQueries({ queryKey: ["trash"] }); if (selected?.id === id) setSelected(null); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.hint}>Recibos guardados antes de borrar historial. Toca uno para abrirlo.</Text>
      {q.isLoading ? <Loading /> : rows.length === 0 ? <EmptyState text="Aún no guardas recibos" /> : rows.map((r) => (
        <TouchableOpacity key={r.id} activeOpacity={0.7} onPress={() => openDetail(r.id)} testID={`registro-${r.id}`}>
          <Card style={s.row}>
            <View style={s.flex}>
              <Text style={s.name}>{fmtDate(r.date_from)} → {fmtDate(r.date_to)}</Text>
              <Text style={s.sub}>{r.note || "Recibo guardado"} · {r.saved_by_name || ""}</Text>
            </View>
            <Text style={s.pay}>{formatCurrency(r.total_payment)}</Text>
            <TouchableOpacity testID={`registro-delete-${r.id}`} onPress={() => del(r.id)} style={s.iconBtn}><Trash2 size={18} color={colors.error} /></TouchableOpacity>
            <ChevronRight size={18} color={colors.muted} />
          </Card>
        </TouchableOpacity>
      ))}
      <View style={{ height: 24 }} />

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={s.backdrop} onPress={() => setSelected(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>Recibo guardado</Text>
              <TouchableOpacity testID="registro-detail-close" onPress={() => setSelected(null)} style={s.closeBtn}><X size={20} color={colors.onSurface} /></TouchableOpacity>
            </View>
            {detailLoading || selected?._loading || !selected ? (
              <View style={{ paddingVertical: 36 }}><Loading /></View>
            ) : (
              <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false} testID="registro-detail-modal">
                <View style={s.infoBox}>
                  <InfoLine label="Rancho" value={(selected.parcels && selected.parcels.length) ? selected.parcels.join(", ") : "—"} c={colors} />
                  <InfoLine label="Trabajo" value={(selected.products && selected.products.length) ? selected.products.join(", ") : "—"} c={colors} />
                  <InfoLine label="Fecha" value={`${fmtDate(selected.date_from)} → ${fmtDate(selected.date_to)}`} c={colors} />
                </View>
                <Text style={s.savedLine}>Guardado {fmtDateTime(selected.saved_at)}{selected.saved_by_name ? ` · por ${selected.saved_by_name}` : ""}</Text>
                <View style={s.statsRow}>
                  <View style={[s.stat, { backgroundColor: colors.brandPrimary }]}><Text style={s.statKW}>Horas</Text><Text style={s.statVW}>{formatNumber(selected.total_hours, 2)}</Text></View>
                  <View style={s.statLight}><Text style={s.statK}>Emp.</Text><Text style={s.statV}>{selected.workers_count}</Text></View>
                  <View style={s.statLight}><Text style={s.statK}>Piezas</Text><Text style={s.statV}>{Math.round(selected.total_units || 0)}</Text></View>
                  <View style={[s.stat, { backgroundColor: colors.error }]}><Text style={s.statKW}>Nómina</Text><Text style={[s.statVW, { fontSize: 12 }]}>{formatCurrency(selected.total_payment)}</Text></View>
                </View>
                {(selected.rows || []).map((r: any) => {
                  const harvests = r.harvests || [];
                  const parcels = uniq(harvests.map((h: any) => h.parcel_name).filter((x: any) => x && x !== "—"));
                  const products = uniq(harvests.map((h: any) => h.product_name).filter((x: any) => x && x !== "—"));
                  const blocks = uniq(harvests.map((h: any) => h.block).filter(Boolean));
                  const varieties = uniq(harvests.map((h: any) => h.variety).filter(Boolean));
                  const prices = uniq(harvests.map((h: any) => h.price_per_unit).filter((x: any) => x > 0));
                  const priceLabel = prices.length === 0 ? "—" : prices.length === 1 ? formatCurrency(prices[0]) : "Varios";
                  const dates = harvests.map((h: any) => h.date).filter(Boolean).sort();
                  const dateLabel = dates.length === 0 ? `${fmtDate(selected.date_from)} → ${fmtDate(selected.date_to)}`
                    : dates[0] === dates[dates.length - 1] ? fmtDate(dates[0]) : `${fmtDate(dates[0])} → ${fmtDate(dates[dates.length - 1])}`;
                  return (
                    <Card key={r.worker_id} style={s.detailCard} testID={`registro-detail-row-${r.worker_id}`}>
                      <View style={s.detailHead}><Text style={s.detailName} numberOfLines={1}>{r.worker_name}</Text><Text style={s.detailPay}>{formatCurrency(r.total_payment)}</Text></View>
                      <View style={s.kvGrid}>
                        <KV k="Rancho" v={parcels.join(", ") || "—"} c={colors} />
                        <KV k="Trabajo" v={products.join(", ") || "—"} c={colors} />
                        <KV k="Block" v={blocks.join(", ") || "—"} c={colors} />
                        <KV k="Variedad" v={varieties.join(", ") || "—"} c={colors} />
                        <KV k="Precio/pieza" v={priceLabel} c={colors} />
                        <KV k="Piezas" v={String(Math.round(r.total_units || 0))} c={colors} />
                        <KV k="Horas" v={`${formatNumber(r.total_hours || 0, 2)}h`} c={colors} />
                        <KV k="Fecha" v={dateLabel} c={colors} />
                      </View>
                    </Card>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const InfoLine = ({ label, value, c }: { label: string; value: string; c: ThemeColors }) => (
  <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
    <Text style={{ width: 62, fontSize: 10, fontWeight: "800", textTransform: "uppercase", color: c.onSurfaceTertiary, paddingTop: 1 }}>{label}</Text>
    <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: c.onSurface }}>{value}</Text>
  </View>
);

const KV = ({ k, v, c }: { k: string; v: string; c: ThemeColors }) => (
  <View style={{ width: "48%" }}>
    <Text style={{ fontSize: 10, fontWeight: "800", textTransform: "uppercase", color: c.onSurfaceTertiary }}>{k}</Text>
    <Text style={{ fontSize: 12, fontWeight: "700", color: c.onSurface }}>{v}</Text>
  </View>
);

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
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 28 },
    sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
    sheetTitle: { fontSize: 18, fontWeight: "900", color: c.onSurface },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
    infoBox: { backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#DBEAFE", borderRadius: 14, padding: 12, gap: 7, marginBottom: 10 },
    savedLine: { fontSize: 11, color: c.onSurfaceTertiary, fontWeight: "600", marginBottom: 12 },
    statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
    stat: { flex: 1, borderRadius: 12, padding: 10 },
    statLight: { flex: 1, borderRadius: 12, padding: 10, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border },
    statKW: { fontSize: 9, fontWeight: "800", textTransform: "uppercase", color: "#FFFFFF", opacity: 0.9 },
    statVW: { fontSize: 16, fontWeight: "900", color: "#FFFFFF", marginTop: 2 },
    statK: { fontSize: 9, fontWeight: "800", textTransform: "uppercase", color: c.onSurfaceTertiary },
    statV: { fontSize: 16, fontWeight: "900", color: c.onSurface, marginTop: 2 },
    detailCard: { marginBottom: 10, padding: 12 },
    detailHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 },
    detailName: { fontWeight: "800", color: c.onSurface, fontSize: 15, flexShrink: 1 },
    detailPay: { fontWeight: "900", color: c.brandPrimary, fontSize: 15 },
    kvGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 6, columnGap: 8 },
  });
