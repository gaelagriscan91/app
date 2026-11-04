import React, { useMemo, useState } from "react";
import { Platform, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Download, Share2, ChevronDown, Calendar, FileSpreadsheet, FileText, SlidersHorizontal, Trash2 } from "lucide-react-native";
import api from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { Card, EmptyState, Loading, ScreenTitle } from "@/src/components/ui";
import { formatCurrency, formatHHMM, formatNumber, startOfMonthISO, todayISO } from "@/src/utils/format";
import { downloadAndShareExcel } from "@/src/utils/download";
import { shareTextSummary } from "@/src/utils/print";
import { useTheme, ThemeColors } from "@/src/theme";

export default function ReportesScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const [tab, setTab] = useState<"cosechas" | "recibos">("cosechas");
  const [dateFrom, setDateFrom] = useState(startOfMonthISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [picker, setPicker] = useState<null | "from" | "to">(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetCheck, setResetCheck] = useState<any>(null);
  const [resetConfirm, setResetConfirm] = useState("");
  const [includeAtt, setIncludeAtt] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [savingReceipt, setSavingReceipt] = useState(false);

  const receiptsQ = useQuery({
    queryKey: ["receipts", dateFrom, dateTo],
    queryFn: async () => (await api.get("/receipts", { params: { date_from: dateFrom, date_to: dateTo } })).data || [],
  });
  const historyQ = useQuery({
    queryKey: ["receipts-history"],
    queryFn: async () => (await api.get("/receipts/history")).data || [],
    enabled: tab === "recibos",
  });
  useFocusEffect(React.useCallback(() => { receiptsQ.refetch(); if (tab === "recibos") historyQ.refetch(); }, [tab]));

  const receipts = receiptsQ.data || [];
  const totals = useMemo(() => receipts.reduce((acc: any, r: any) => ({
    units: acc.units + Number(r.total_units || 0),
    hours: acc.hours + Number(r.total_hours || 0),
    payment: acc.payment + Number(r.total_payment || 0),
  }), { units: 0, hours: 0, payment: 0 }), [receipts]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadAndShareExcel("/harvests/export", { date_from: dateFrom, date_to: dateTo }, `reporte_cosechas_${todayISO()}.xlsx`);
      toast.success("Excel generado");
    } catch (e: any) { toast.error(e?.message || "No se pudo exportar"); }
    finally { setExporting(false); }
  };

  const share = async () => {
    if (!receipts.length) { toast.error("No hay datos para compartir"); return; }
    setSharing(true);
    const lines = [
      "AgriScan — Reporte de cosechas",
      `Periodo: ${dateFrom} → ${dateTo}`,
      "",
      `Unidades: ${formatNumber(totals.units, 0)}`,
      `Horas: ${formatNumber(totals.hours, 2)}`,
      `Total a pagar: ${formatCurrency(totals.payment)}`,
      "",
      ...receipts.slice(0, 30).map((r: any) => `• ${r.worker_name}: ${formatCurrency(r.total_payment)}`),
    ].join("\n");
    try { await shareTextSummary("Reporte de cosechas", lines); } catch { toast.error("No se pudo compartir"); }
    finally { setSharing(false); }
  };

  const openReset = async () => {
    setResetConfirm(""); setResetCheck(null);
    setShowReset(true);
    try { const { data } = await api.get("/harvests/reset-check"); setResetCheck(data); }
    catch { setResetCheck({ unsaved: false }); }
  };

  const saveReceiptFirst = async () => {
    if (!resetCheck) return;
    setSavingReceipt(true);
    try {
      await api.post("/receipts/history", { date_from: resetCheck.date_from, date_to: resetCheck.date_to, note: "Guardado antes de borrar historial" });
      toast.success("Recibo guardado");
      setResetCheck({ ...resetCheck, unsaved: false });
    } catch { toast.error("No se pudo guardar el recibo"); }
    finally { setSavingReceipt(false); }
  };

  const resetAll = async () => {
    if (resetConfirm.trim().toUpperCase() !== "BORRAR") { toast.error('Escribe "BORRAR" para confirmar'); return; }
    setResetting(true);
    try {
      const { data } = await api.post("/harvests/reset", null, { params: { include_attendance: includeAtt } });
      toast.success(`Historial borrado: ${data.harvests_deleted} cosechas${includeAtt ? ` y ${data.attendance_deleted} asistencias` : ""}`);
      setShowReset(false);
      receiptsQ.refetch();
    } catch { toast.error("No se pudo borrar"); }
    finally { setResetting(false); }
  };

  return (
    <View style={[s.flex, { backgroundColor: colors.surfaceSecondary }]}>
      <ScrollView contentContainerStyle={s.scroll}>
        <ScreenTitle title="Reportes" subtitle="Cosechas, recibos y exportación" />

        <View style={s.tabs}>
          <TouchableOpacity testID="rep-tab-cosechas" onPress={() => setTab("cosechas")} style={[s.tabBtn, tab === "cosechas" && s.tabActive]}>
            <FileSpreadsheet size={16} color={tab === "cosechas" ? "#FFFFFF" : colors.onSurfaceTertiary} />
            <Text style={[s.tabText, tab === "cosechas" && s.tabTextActive]}>Cosechas</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="rep-tab-recibos" onPress={() => setTab("recibos")} style={[s.tabBtn, tab === "recibos" && s.tabActive]}>
            <FileText size={16} color={tab === "recibos" ? "#FFFFFF" : colors.onSurfaceTertiary} />
            <Text style={[s.tabText, tab === "recibos" && s.tabTextActive]}>Recibos</Text>
          </TouchableOpacity>
        </View>

        {tab === "cosechas" ? (
          <>
            <View style={s.btnRow}>
              <TouchableOpacity testID="rep-filters" onPress={() => setShowFilters((v) => !v)} style={s.filterBtn}>
                <SlidersHorizontal size={16} color={colors.brandPrimary} /><Text style={s.filterText}>Aplicar filtros</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="rep-export" onPress={exportExcel} disabled={exporting || !receipts.length} style={[s.redBtn, { opacity: exporting || !receipts.length ? 0.6 : 1 }]}>
                <Download size={16} color="#FFFFFF" /><Text style={s.redText}>{exporting ? "..." : "Exportar a Excel"}</Text>
              </TouchableOpacity>
            </View>

            <View style={s.btnRow}>
              <TouchableOpacity testID="rep-date-from" onPress={() => setPicker("from")} style={s.datePill}>
                <Calendar size={14} color={colors.muted} /><Text style={s.dateText}>{dateFrom} → {dateTo}</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="rep-clear-all" onPress={openReset} style={s.redBtn}>
                <Trash2 size={16} color="#FFFFFF" /><Text style={s.redText}>Borrar todo</Text>
              </TouchableOpacity>
            </View>

            {showFilters && (
              <View style={s.dateRow}>
                <TouchableOpacity testID="rep-date-to" onPress={() => setPicker("to")} style={s.dateBtn}><Calendar size={14} color={colors.muted} /><Text style={s.dateText}>Hasta: {dateTo}</Text></TouchableOpacity>
                <TouchableOpacity testID="rep-share" onPress={share} disabled={sharing || !receipts.length} style={s.dateBtn}><Share2 size={14} color={colors.brandPrimary} /><Text style={[s.dateText, { color: colors.brandPrimary }]}>{sharing ? "..." : "Compartir"}</Text></TouchableOpacity>
              </View>
            )}

            {picker && (
              <DateTimePicker
                value={new Date(`${picker === "from" ? dateFrom : dateTo}T12:00:00`)}
                mode="date" display={Platform.OS === "ios" ? "inline" : "default"}
                onChange={(_, d) => {
                  setPicker(Platform.OS === "ios" ? picker : null);
                  if (d) { const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; picker === "from" ? setDateFrom(iso) : setDateTo(iso); }
                }}
              />
            )}

            <View style={s.resumenHead}>
              <FileText size={18} color={colors.brandPrimary} /><Text style={s.resumenTitle}>Resumen por empleado</Text>
            </View>

            {receiptsQ.isLoading ? <Loading /> : receipts.length === 0 ? <EmptyState text="Sin resultados en este periodo" /> : receipts.map((r: any) => {
              const open = expanded === r.worker_id;
              return (
                <Card key={r.worker_id} style={{ marginBottom: 10 }} testID={`worker-summary-${r.worker_id}`}>
                  <TouchableOpacity onPress={() => setExpanded(open ? null : r.worker_id)} style={s.sumRow}>
                    <View style={s.flex}>
                      <Text style={s.sumName}>{r.worker_name}</Text>
                      <Text style={s.sumSub}>{formatNumber(r.total_units, 0)} u. · {formatNumber(r.total_hours, 2)} h · {(r.harvests?.length || 0)} registros</Text>
                    </View>
                    <Text style={s.sumPay}>{formatCurrency(r.total_payment)}</Text>
                    <ChevronDown size={18} color={colors.muted} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
                  </TouchableOpacity>
                  {open && (r.harvests || []).length > 0 && (
                    <View style={s.detail}>
                      {r.harvests.map((h: any, i: number) => (
                        <View key={h.id || i} style={s.detailRow}>
                          <View style={s.detailDate}>
                            <Text style={s.detailDateText}>{h.date}</Text>
                            {formatHHMM(h.created_at) ? <Text style={s.detailTime}>{formatHHMM(h.created_at)}</Text> : null}
                          </View>
                          <Text style={s.detailMid}>{formatNumber(h.units, h.units % 1 === 0 ? 0 : 2)} {h.unit_label || "u"}</Text>
                          <Text style={s.detailPay}>{formatCurrency(h.payment)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
              );
            })}
          </>
        ) : (
          <View style={{ marginTop: 14 }}>
            {historyQ.isLoading ? <Loading /> : (historyQ.data || []).length === 0 ? <EmptyState text="Aún no guardas recibos" /> : (historyQ.data || []).map((h: any) => (
              <Card key={h.id} style={{ marginBottom: 10 }} testID={`history-${h.id}`}>
                <View style={s.sumRow}>
                  <View style={s.flex}>
                    <Text style={s.sumName}>{h.date_from} → {h.date_to}</Text>
                    <Text style={s.sumSub}>{h.note || `${h.worker_count || h.rows_count || 0} empleados`} · {h.saved_by_name || ""}</Text>
                  </View>
                  <Text style={s.sumPay}>{formatCurrency(h.total_payment)}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal visible={showReset} transparent animationType="fade" onRequestClose={() => setShowReset(false)}>
        <View style={s.modalWrap}>
          <View style={s.confirmCard} testID="reset-modal">
            <Text style={s.confirmTitle}>Borrar todo el historial</Text>
            <Text style={s.confirmSub}>Se eliminarán TODAS las cosechas{includeAtt ? " y las asistencias" : ""} de tu cuenta. Esta acción no se puede deshacer.</Text>

            {resetCheck?.unsaved ? (
              <TouchableOpacity testID="reset-save-receipt" onPress={saveReceiptFirst} disabled={savingReceipt} style={s.saveFirstBtn}>
                <Text style={s.saveFirstText}>{savingReceipt ? "Guardando…" : "Guardar recibo antes de borrar"}</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity testID="reset-include-attendance" onPress={() => setIncludeAtt((v) => !v)} style={s.checkRow}>
              <View style={[s.checkbox, includeAtt && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>{includeAtt ? <Text style={s.checkMark}>✓</Text> : null}</View>
              <Text style={s.checkLabel}>También borrar asistencias</Text>
            </TouchableOpacity>

            <TextInput testID="reset-confirm-input" value={resetConfirm} onChangeText={setResetConfirm} placeholder='Escribe "BORRAR"' placeholderTextColor={colors.muted} autoCapitalize="characters" style={s.input} />

            <View style={s.confirmBtns}>
              <TouchableOpacity testID="reset-cancel" onPress={() => setShowReset(false)} style={[s.confirmBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}><Text style={[s.confirmBtnText, { color: colors.onSurfaceTertiary }]}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity testID="reset-confirm-btn" onPress={resetAll} disabled={resetting} style={[s.confirmBtn, { backgroundColor: colors.error }]}><Text style={s.confirmBtnText}>{resetting ? "Borrando…" : "Borrar todo"}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: { padding: 16 },
    tabs: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 14 },
    tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    tabActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
    tabText: { fontWeight: "700", color: c.onSurfaceTertiary, fontSize: 14 },
    tabTextActive: { color: "#FFFFFF" },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    dateBtn: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, height: 46, paddingHorizontal: 12 },
    dateText: { fontWeight: "700", color: c.onSurface, fontSize: 14 },
    arrow: { color: c.muted, fontWeight: "800" },
    btnRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    filterBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.brandPrimary },
    filterText: { color: c.brandPrimary, fontWeight: "800", fontSize: 15 },
    redBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, backgroundColor: c.error },
    redText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
    datePill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 14, height: 50, paddingHorizontal: 14 },
    resumenHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 12 },
    resumenTitle: { fontSize: 17, fontWeight: "800", color: c.onSurface },
    modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 32 },
    confirmCard: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 24, width: "100%" },
    confirmTitle: { fontSize: 20, fontWeight: "800", color: c.onSurface, textAlign: "center" },
    confirmSub: { fontSize: 13, color: c.onSurfaceTertiary, textAlign: "center", marginTop: 8, marginBottom: 18, lineHeight: 19 },
    confirmBtns: { flexDirection: "row", gap: 12 },
    confirmBtn: { flex: 1, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    confirmBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
    saveFirstBtn: { backgroundColor: "#FEF3C7", borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 14 },
    saveFirstText: { color: "#92400E", fontWeight: "800", fontSize: 14 },
    checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
    checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
    checkMark: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
    checkLabel: { fontSize: 14, fontWeight: "700", color: c.onSurface },
    input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, height: 50, paddingHorizontal: 14, fontSize: 16, color: c.onSurface, marginBottom: 16 },
    actionRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 12 },
    actionText: { color: "#FFFFFF", fontWeight: "800" },
    totalsCard: { flexDirection: "row", marginBottom: 14 },
    totalCell: { flex: 1, alignItems: "center" },
    totalLabel: { fontSize: 11, color: c.muted, fontWeight: "700", textTransform: "uppercase" },
    totalVal: { fontSize: 17, fontWeight: "800", color: c.onSurface, marginTop: 3 },
    sumRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    sumName: { fontWeight: "800", color: c.onSurface, fontSize: 15 },
    sumSub: { fontSize: 12, color: c.onSurfaceTertiary, marginTop: 2 },
    sumPay: { fontWeight: "800", color: c.brandPrimary, fontSize: 16 },
    detail: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.divider, gap: 6 },
    detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    detailDate: { width: 90 },
    detailDateText: { fontSize: 12, fontWeight: "700", color: c.onSurface },
    detailTime: { fontSize: 11, color: c.muted, marginTop: 1 },
    detailMid: { fontSize: 12, color: c.onSurfaceTertiary, flex: 1 },
    detailPay: { fontSize: 13, fontWeight: "800", color: c.brandPrimary },
  });
