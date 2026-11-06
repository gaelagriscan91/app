import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Share2 } from "lucide-react-native";
import api from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { Card, EmptyState, FlatGroup, Loading } from "@/src/components/ui";
import { formatCurrency, formatNumber, todayISO } from "@/src/utils/format";
import { sharePayrollSheet } from "@/src/utils/print";
import { useTheme, ThemeColors } from "@/src/theme";

const mondayOf = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const shiftWeek = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 7 * n);
  return d.toISOString().slice(0, 10);
};
const short = (iso?: string) => { if (!iso) return "…"; const [y, m, d] = iso.split("-"); return `${m}-${d}-${y.slice(2)}`; };

export default function PayrollModule() {
  const { colors } = useTheme();
  const s = styles(colors);
  const [week, setWeek] = useState(mondayOf(todayISO()));
  const [grower, setGrower] = useState("");
  const [sharing, setSharing] = useState(false);

  const q = useQuery({
    queryKey: ["payroll", week, grower],
    queryFn: async () => (await api.get("/payroll", { params: { week, grower, include_sunday: false } })).data,
  });
  const data = q.data;

  const share = async () => {
    if (!data?.rows?.length) { toast.error("No hay datos esta semana"); return; }
    setSharing(true);
    try { await sharePayrollSheet(data); }
    catch (e: any) { toast.error(e?.message || "No se pudo compartir"); }
    finally { setSharing(false); }
  };

  const growers: string[] = data?.growers || [];
  const totalPieces: number = (data?.rows || []).reduce((sum: number, r: any) => sum + (r.total_units || 0), 0);

  React.useEffect(() => {
    if (!grower && growers.length > 0) setGrower(growers[0]);
  }, [growers, grower]);

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Card style={{ marginBottom: 14 }}>
        <View style={s.weekRow}>
          <TouchableOpacity testID="payroll-prev" onPress={() => setWeek(shiftWeek(week, -1))} style={s.navBtn}><ChevronLeft size={20} color={colors.onSurface} /></TouchableOpacity>
          <View style={s.weekMid}>
            <Text style={s.weekLabel}>Semana (lun → sáb)</Text>
            <Text style={s.weekValue} testID="payroll-week">{data ? `${short(data.week_start)} → ${short(data.week_end)}` : "…"}</Text>
          </View>
          <TouchableOpacity testID="payroll-next" onPress={() => setWeek(shiftWeek(week, 1))} style={s.navBtn}><ChevronRight size={20} color={colors.onSurface} /></TouchableOpacity>
        </View>
        <TouchableOpacity testID="payroll-share" onPress={share} disabled={sharing} style={s.shareBtn}>
          <Share2 size={16} color="#FFFFFF" /><Text style={s.shareText}>Compartir Payroll</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.growerRow}>
          {growers.length === 0 ? <Text style={s.noGrowers}>Sin growers esta semana</Text> : growers.map((g) => (
            <TouchableOpacity key={g} testID={`payroll-grower-${g}`} onPress={() => setGrower(g)} style={[s.growerChip, grower === g && s.growerChipActive]}>
              <Text style={[s.growerChipText, grower === g && s.growerChipTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Card>

      {q.isLoading ? <Loading /> : !data?.rows?.length ? <EmptyState text="No hay recibos en esta semana" /> : (
        <FlatGroup style={s.flatList}>
          <Text style={s.grower}>Grower: {data.grower || "Todos"} · Mayordomo: {data.mayordomo || "—"}</Text>
          {data.rows.map((r: any) => (
            <View key={r.worker_name} style={s.payRow} testID={`payroll-row-${r.worker_name}`}>
              <View style={s.flex}>
                <Text style={s.payName}>{r.worker_name}</Text>
                <Text style={s.payPieces} testID={`payroll-pieces-${r.worker_name}`}>{formatNumber(r.total_units || 0, r.total_units % 1 === 0 ? 0 : 2)} pz</Text>
              </View>
              <Text style={s.payTotal}>{formatCurrency(r.total)}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <View style={s.flex}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalPieces} testID="payroll-total-pieces">{formatNumber(totalPieces, totalPieces % 1 === 0 ? 0 : 2)} pz</Text>
            </View>
            <Text style={s.totalVal}>{formatCurrency(data.total)}</Text>
          </View>
        </FlatGroup>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    scroll: { padding: 16 },
    weekRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    navBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
    weekMid: { alignItems: "center" },
    weekLabel: { fontSize: 10, color: c.muted, fontWeight: "700", textTransform: "uppercase" },
    weekValue: { fontSize: 16, fontWeight: "800", color: c.onSurface, marginTop: 2 },
    shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.brandPrimary, height: 46, borderRadius: 12 },
    shareText: { color: "#FFFFFF", fontWeight: "800" },
    growerRow: { gap: 8, paddingTop: 12 },
    noGrowers: { color: c.muted, fontWeight: "600", fontSize: 13, paddingTop: 4 },
    growerChip: { paddingHorizontal: 14, height: 38, borderRadius: 19, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
    growerChipActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
    growerChipText: { fontWeight: "700", color: c.onSurfaceTertiary, fontSize: 13 },
    growerChipTextActive: { color: "#FFFFFF" },
    grower: { fontSize: 13, fontWeight: "700", color: c.onSurfaceTertiary, marginBottom: 10, paddingHorizontal: 20 },
    flex: { flex: 1 },
    flatList: { marginHorizontal: -16, paddingTop: 12, paddingBottom: 14 },
    payRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: c.hairline },
    payName: { fontWeight: "700", color: c.onSurface, fontSize: 15 },
    payPieces: { fontWeight: "600", color: c.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
    payTotal: { fontWeight: "800", color: c.brandPrimary, fontSize: 15 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingHorizontal: 20, marginTop: 6, borderTopWidth: 2, borderTopColor: c.hairlineStrong },
    totalLabel: { fontWeight: "800", color: c.onSurface, fontSize: 15 },
    totalPieces: { fontWeight: "700", color: c.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
    totalVal: { fontWeight: "900", color: c.onSurface, fontSize: 18 },
  });
