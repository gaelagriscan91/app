import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, X, Users, Clock, FileText, ChevronRight, Calendar, Share2 } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { shareReceiptSheet } from "@/src/utils/print";
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
const fmtTimeAmPm = (iso?: string) => {
  if (!iso) return "—";
  try {
    const t = new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
    return t.replace("AM", "a.m.").replace("PM", "p.m.");
  } catch { return "—"; }
};
const fmtMDY = (d?: string) => {
  if (!d) return "—";
  try { return new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US"); }
  catch { return d; }
};
const fmtHoursHM = (x?: number) => {
  const v = Number(x || 0);
  if (v <= 0) return "0h";
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
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

  const share = async (r: any) => {
    try {
      let full = r;
      if (!r.rows) { const { data } = await api.get(`/receipts/history/${r.id}`); full = data; }
      await shareReceiptSheet(full);
    } catch (e) { toast.error(apiErrorMessage(e)); }
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
            <TouchableOpacity testID={`registro-share-${r.id}`} onPress={() => share(r)} style={s.iconBtn}><Share2 size={18} color={colors.brandPrimary} /></TouchableOpacity>
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
            ) : (() => {
              const rows = (selected.rows || []);
              const allH = rows.flatMap((r: any) => r.harvests || []);
              const pick = (arr: any[]) => { const u = uniq(arr.filter((x) => x && x !== "—")); return u.length === 0 ? "—" : u.length === 1 ? String(u[0]) : "Varios"; };
              const head = {
                ranch: pick(allH.map((h: any) => h.parcel_name)),
                block: pick(allH.map((h: any) => h.block)),
                trabajo: pick(allH.map((h: any) => h.product_name)),
                variedad: pick(allH.map((h: any) => h.variety)),
                mayordomo: pick(allH.map((h: any) => h.mayordomo)) !== "—" ? pick(allH.map((h: any) => h.mayordomo)) : (selected.saved_by_name || "—"),
                grower: pick(allH.map((h: any) => h.grower)),
              };
              const COLS = [
                { k: "ss", label: "SS#", w: 92 },
                { k: "name", label: "EMPLOYEE NAME", w: 150 },
                { k: "in", label: "Hora entrada", w: 100 },
                { k: "date", label: "Fecha", w: 86 },
                { k: "out", label: "Hora Salida", w: 100 },
                { k: "hours", label: "Total Horas", w: 86 },
                { k: "pieces", label: "Total piezas", w: 78 },
                { k: "price", label: "Precio", w: 66 },
                { k: "amount", label: "$", w: 80 },
              ];
              return (
                <ScrollView style={{ maxHeight: 580 }} showsVerticalScrollIndicator={false} testID="registro-detail-modal">
                  <View style={s.sheetGrid}>
                    <HeadCell label="RANCH" value={head.ranch} />
                    <HeadCell label="BLOCK#" value={head.block} />
                    <HeadCell label="Trabajo" value={head.trabajo} last />
                    <HeadCell label="Variedad" value={head.variedad} />
                    <HeadCell label="Mayordomo" value={head.mayordomo} />
                    <HeadCell label="Grower" value={head.grower} last />
                  </View>
                  <Text style={s.savedLine}>Guardado {fmtDateTime(selected.saved_at)}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: 6 }}>
                    <View>
                      <View style={[s.tr, s.trHead]}>
                        {COLS.map((c) => <Text key={c.k} style={[s.th, { width: c.w }]}>{c.label}</Text>)}
                      </View>
                      {rows.map((r: any, idx: number) => {
                        const h0 = (r.harvests || [])[0] || {};
                        const prices = uniq((r.harvests || []).map((h: any) => h.price_per_unit).filter((x: any) => x > 0));
                        const price = prices.length === 0 ? "—" : prices.length === 1 ? formatCurrency(prices[0]) : "Varios";
                        const date = (r.attendance || [])[0]?.date || h0.date || selected.date_from;
                        return (
                          <View key={r.worker_id || idx} style={[s.tr, idx % 2 === 1 && s.trAlt]} testID={`receipt-row-${r.worker_id}`}>
                            <Text style={[s.td, { width: 92 }]}>{r.document_id || ""}</Text>
                            <Text style={[s.td, s.tdName, { width: 150 }]} numberOfLines={1}>{r.worker_name}</Text>
                            <Text style={[s.td, { width: 100 }]}>{fmtTimeAmPm(r.min_check_in_iso)}</Text>
                            <Text style={[s.td, { width: 86 }]}>{fmtMDY(date)}</Text>
                            <Text style={[s.td, { width: 100 }]}>{r.still_working ? "—" : fmtTimeAmPm(r.max_check_out_iso)}</Text>
                            <Text style={[s.td, { width: 86 }]}>{fmtHoursHM(r.total_hours)}</Text>
                            <Text style={[s.td, s.tdNum, { width: 78 }]}>{Math.round(r.total_units || 0)}</Text>
                            <Text style={[s.td, s.tdNum, { width: 66 }]}>{price}</Text>
                            <Text style={[s.td, s.tdNum, s.tdAmount, { width: 80 }]}>{formatCurrency(r.total_payment)}</Text>
                          </View>
                        );
                      })}
                      <View style={[s.tr, s.trTotal]}>
                        <Text style={[s.td, s.tdTotalLabel, { width: 92 + 150 + 100 + 86 + 100 }]}>TOTAL</Text>
                        <Text style={[s.td, s.tdNum, s.tdTotalVal, { width: 86 }]}>{fmtHoursHM(selected.total_hours)}</Text>
                        <Text style={[s.td, s.tdNum, s.tdTotalVal, { width: 78 }]}>{Math.round(selected.total_units || 0)}</Text>
                        <Text style={[s.td, { width: 66 }]}></Text>
                        <Text style={[s.td, s.tdNum, s.tdTotalVal, { width: 80 }]}>{formatCurrency(selected.total_payment)}</Text>
                      </View>
                    </View>
                  </ScrollView>
                  <View style={{ height: 20 }} />
                </ScrollView>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const HeadCell = ({ label, value, last }: { label: string; value: string; last?: boolean }) => (
  <View style={[hc.cell, last && { borderRightWidth: 0 }]}>
    <Text style={hc.label}>{label}</Text>
    <Text style={hc.value} numberOfLines={1}>{value}</Text>
  </View>
);

const hc = StyleSheet.create({
  cell: { width: "33.333%", borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#111827", paddingVertical: 4, paddingHorizontal: 6 },
  label: { fontSize: 9, fontWeight: "800", color: "#111827", textTransform: "uppercase" },
  value: { fontSize: 11, fontWeight: "600", color: "#374151", marginTop: 1 },
});

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
    savedLine: { fontSize: 11, color: c.onSurfaceTertiary, fontWeight: "600", marginTop: 8, marginBottom: 10 },
    sheetGrid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#111827" },
    tr: { flexDirection: "row" },
    trHead: { backgroundColor: "#D1D5DB" },
    trAlt: { backgroundColor: "#F9FAFB" },
    trTotal: { backgroundColor: "#E5E7EB", borderTopWidth: 1.5, borderColor: "#111827" },
    th: { fontSize: 10, fontWeight: "800", color: "#111827", paddingVertical: 6, paddingHorizontal: 6, borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#111827" },
    td: { fontSize: 11, color: "#1F2937", paddingVertical: 5, paddingHorizontal: 6, borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#9CA3AF" },
    tdName: { fontWeight: "700", color: "#111827" },
    tdNum: { textAlign: "right" },
    tdAmount: { fontWeight: "800", color: "#111827" },
    tdTotalLabel: { fontWeight: "900", color: "#111827", textAlign: "right" },
    tdTotalVal: { fontWeight: "900", color: "#111827" },
  });
