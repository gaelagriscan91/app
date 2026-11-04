import React, { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Clock, AlertCircle, Share2, Calendar, Loader } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { Card, EmptyState, Loading, ScreenTitle } from "@/src/components/ui";
import { formatNumber, todayISO } from "@/src/utils/format";
import { shareTextSummary } from "@/src/utils/print";
import { useTheme, ThemeColors } from "@/src/theme";

export default function DiaScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [showPicker, setShowPicker] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const q = useQuery({
    queryKey: ["dia", date],
    queryFn: async () => {
      const [att, daily] = await Promise.all([
        api.get("/attendance", { params: { date } }),
        api.get("/harvests/daily", { params: { date } }),
      ]);
      return { attendance: att.data?.rows || [], byWorker: daily.data?.by_worker || [] };
    },
  });
  useFocusEffect(React.useCallback(() => { q.refetch(); }, [date]));

  const attendance = q.data?.attendance || [];
  const byWorker = q.data?.byWorker || [];
  const checkedInIds = new Set(attendance.filter((a: any) => a.check_in).map((a: any) => a.worker_id));
  const missing = byWorker.filter((w: any) => !checkedInIds.has(w.worker_id));

  const addCheckIn = async (workerId: string, name: string) => {
    setAddingId(workerId);
    try {
      await api.post("/attendance/scan", { code: workerId, date });
      toast.success(`Entrada registrada: ${name}`);
      qc.invalidateQueries({ queryKey: ["dia", date] });
    } catch (e) { toast.error(apiErrorMessage(e, "No se pudo registrar")); }
    finally { setAddingId(null); }
  };

  const share = async () => {
    if (!attendance.length && !byWorker.length) { toast.error("No hay nada que compartir"); return; }
    setSharing(true);
    const lines = attendance.map((a: any) => `• ${a.worker_name}: ${a.check_in_hhmm || "--:--"}${a.check_out_hhmm ? ` → ${a.check_out_hhmm}` : ""}${a.hours ? ` (${formatNumber(a.hours, 2)} h)` : ""}`);
    const text = [`AgriScan — Lista del día ${date}`, `${attendance.length} empleado(s) con entrada`, ...lines,
      ...(missing.length ? ["", `Sin entrada: ${missing.map((w: any) => w.worker_name).join(", ")}`] : [])].join("\n");
    try { await shareTextSummary("Lista del día", text); } catch { toast.error("No se pudo compartir"); }
    finally { setSharing(false); }
  };

  return (
    <View style={[s.flex, { backgroundColor: colors.surfaceSecondary }]}>
      <ScrollView contentContainerStyle={s.scroll}>
        <ScreenTitle title="Lista del día" subtitle="Entradas y horas de empleados" />
        <View style={s.topRow}>
          <TouchableOpacity testID="dia-date-button" onPress={() => setShowPicker(true)} style={s.dateBtn}>
            <Calendar size={16} color={colors.onSurfaceTertiary} />
            <Text style={s.dateText}>{date}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="dia-share-button" onPress={share} disabled={sharing} style={s.shareBtn}>
            {sharing ? <Loader size={16} color="#FFFFFF" /> : <Share2 size={16} color="#FFFFFF" />}
            <Text style={s.shareText}>Compartir</Text>
          </TouchableOpacity>
        </View>

        {showPicker && (
          <DateTimePicker
            value={new Date(`${date}T12:00:00`)}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(_, d) => {
              setShowPicker(Platform.OS === "ios");
              if (d) {
                const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
                setDate(`${y}-${m}-${day}`);
              }
            }}
          />
        )}

        {q.isLoading ? <Loading /> : (
          <>
            <Card style={{ marginTop: 14 }} testID="checked-in-section">
              <View style={s.sectionHead}><View style={[s.sdot, { backgroundColor: colors.success }]} /><Text style={s.sectionTitle}>Con entrada · {attendance.length}</Text></View>
              {attendance.length === 0 ? <EmptyState text="Nadie tiene entrada en esta fecha" /> : attendance.map((a: any) => (
                <View key={a.id || a.worker_id} style={s.diaRow} testID={`dia-att-${a.worker_id}`}>
                  <Text style={s.rowName}>{a.worker_name}</Text>
                  <View style={s.rowRight}>
                    <Clock size={13} color={colors.muted} />
                    <Text style={s.rowTime}>{a.check_in_hhmm || "--:--"}{a.check_out_hhmm ? ` → ${a.check_out_hhmm}` : ""}</Text>
                  </View>
                </View>
              ))}
            </Card>

            {missing.length > 0 && (
              <Card style={[s.missingCard, { marginTop: 14 }]} testID="missing-section">
                <View style={s.sectionHead}><AlertCircle size={16} color={colors.error} /><Text style={[s.sectionTitle, { color: colors.error }]}>Sin entrada · {missing.length}</Text></View>
                <Text style={s.missingHint}>Trabajando pero sin entrada. Toca para registrarla.</Text>
                {missing.map((w: any) => (
                  <TouchableOpacity key={w.worker_id} testID={`missing-${w.worker_id}`} onPress={() => addCheckIn(w.worker_id, w.worker_name)} disabled={addingId === w.worker_id} style={s.diaRow}>
                    <View style={s.flex}>
                      <Text style={s.rowName}>{w.worker_name}</Text>
                      <Text style={s.missingSub}>{formatNumber(w.units, 0)} u. · {w.count} registro{w.count !== 1 ? "s" : ""}</Text>
                    </View>
                    <Text style={s.addText}>{addingId === w.worker_id ? "..." : "+ Entrada"}</Text>
                  </TouchableOpacity>
                ))}
              </Card>
            )}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: { padding: 16 },
    topRow: { flexDirection: "row", gap: 10, marginTop: 14 },
    dateBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, height: 48, paddingHorizontal: 14 },
    dateText: { fontSize: 15, fontWeight: "700", color: c.onSurface },
    shareBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.brandPrimary, borderRadius: 12, height: 48, paddingHorizontal: 18 },
    shareText: { color: "#FFFFFF", fontWeight: "800" },
    sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    sdot: { width: 10, height: 10, borderRadius: 5 },
    sectionTitle: { fontSize: 15, fontWeight: "800", color: c.onSurface },
    diaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.divider, gap: 10 },
    rowName: { fontWeight: "800", color: c.onSurface, fontSize: 15, flex: 1 },
    rowRight: { flexDirection: "row", alignItems: "center", gap: 5 },
    rowTime: { fontWeight: "700", color: c.onSurfaceTertiary, fontSize: 14 },
    missingCard: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
    missingHint: { color: "#B91C1C", fontWeight: "600", fontSize: 12, marginBottom: 6 },
    missingSub: { fontSize: 12, color: c.onSurfaceTertiary, marginTop: 2 },
    addText: { color: c.error, fontWeight: "800", fontSize: 13 },
  });
