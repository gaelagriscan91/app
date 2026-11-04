import React, { useMemo, useState } from "react";
import { Platform, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Download, Share2, ChevronDown, Calendar, FileSpreadsheet, FileText, SlidersHorizontal, Trash2, Settings } from "lucide-react-native";
import api from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { Card, EmptyState, Loading, ScreenTitle } from "@/src/components/ui";
import { formatCurrency, formatNumber, startOfMonthISO, todayISO } from "@/src/utils/format";
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
  const [showMenu, setShowMenu] = useState(false);
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

  const shareSavedReceipt = async (h: any) => {
    const rows = h.rows || [];
    const lines = [
      "AgriScan — Recibo guardado",
      `Periodo: ${h.date_from} → ${h.date_to}`,
      h.saved_by_name ? `Guardado por: ${h.saved_by_name}` : "",
      "",
      `Empleados: ${h.workers_count || h.worker_count || rows.length || 0}`,
      `Horas: ${formatNumber(h.total_hours || 0, 2)}`,
      `Piezas: ${Math.round(h.total_units || 0)}`,
      `Total a pagar: ${formatCurrency(h.total_payment || 0)}`,
      "",
      ...rows.slice(0, 50).map((r: any) => `• ${r.worker_name}: ${formatCurrency(r.total_payment)}`),
    ].filter(Boolean).join("\n");
    try { await shareTextSummary("Recibo guardado", lines); } catch { toast.error("No se pudo compartir"); }
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
            <View style={s.fechaRow}>
              <View style={s.flex}>
                <Text style={s.fechaLabel}>Fecha</Text>
                <Text style={s.fechaRange}>{dateFrom} → {dateTo}</Text>
              </View>
              <TouchableOpacity testID="rep-gear" onPress={() => setShowMenu(true)} style={s.gearBtn}>
                <Settings size={24} color={colors.onSurfaceTertiary} />
              </TouchableOpacity>
            </View>

            {showFilters && (
              <View style={s.dateRow}>
                <TouchableOpacity testID="rep-date-from" onPress={() => setPicker("from")} style={s.dateBtn}><Calendar size={14} color={colors.muted} /><Text style={s.dateText}>Desde: {dateFrom}</Text></TouchableOpacity>
                <TouchableOpacity testID="rep-date-to" onPress={() => setPicker("to")} style={s.dateBtn}><Calendar size={14} color={colors.muted} /><Text style={s.dateText}>Hasta: {dateTo}</Text></TouchableOpacity>
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

            {receipts.length > 0 && (
              <View style={s.pzBar} testID="rep-total-units"><Text style={s.pzText}>{formatNumber(totals.units, totals.units % 1 === 0 ? 0 : 2)} pz</Text></View>
            )}

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
                          <Text style={s.detailDate}>{h.date}</Text>
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
                    <Text style={s.sumSub}>{h.note || `${h.workers_count || h.worker_count || h.rows_count || 0} empleados`} · {h.saved_by_name || ""}</Text>
                  </View>
                  <Text style={s.sumPay}>{formatCurrency(h.total_payment)}</Text>
                </View>
                <TouchableOpacity testID={`history-share-${h.id}`} onPress={() => shareSavedReceipt(h)} style={s.shareSavedBtn}>
                  <Share2 size={16} color={colors.brandPrimary} /><Text style={s.shareSavedText}>Compartir recibo guardado</Text>
                </TouchableOpacity>
              </Card>
            ))}
          </View>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={s.menuBackdrop} onPress={() => setShowMenu(false)}>
          <View style={s.menuCard} testID="rep-menu">
            <View style={s.menuHeadRow}>
              <Text style={s.menuHeadText}>Recibos</Text>
              <FileText size={18} color={colors.onSurface} />
            </View>
            <TouchableOpacity testID="menu-recibos" onPress={() => { setShowMenu(false); setTab("recibos"); }} style={s.menuItem}>
              <Text style={s.menuItemText}>Ver recibos guardados</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="menu-filters" onPress={() => { setShowMenu(false); setShowFilters(true); }} style={s.menuItem}>
              <SlidersHorizontal size={16} color={colors.onSurfaceTertiary} /><Text style={s.menuItemText}>Aplicar filtros</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="menu-export" onPress={() => { setShowMenu(false); exportExcel(); }} disabled={!receipts.length} style={[s.menuItem, { opacity: receipts.length ? 1 : 0.5 }]}>
              <Download size={16} color={colors.onSurfaceTertiary} /><Text style={s.menuItemText}>Exportar a Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="menu-share" onPress={() => { setShowMenu(false); share(); }} disabled={!receipts.length} style={[s.menuItem, { opacity: receipts.length ? 1 : 0.5 }]}>
              <Share2 size={16} color={colors.onSurfaceTertiary} /><Text style={s.menuItemText}>Compartir</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="menu-fecha" onPress={() => { setShowMenu(false); setShowFilters(true); setPicker("from"); }} style={s.menuItem}>
              <Calendar size={16} color={colors.onSurfaceTertiary} /><Text style={s.menuItemText}>Fecha</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="menu-borrar" onPress={() => { setShowMenu(false); openReset(); }} style={[s.menuItem, s.menuItemLast]}>
              <Trash2 size={16} color={colors.error} /><Text style={[s.menuItemText, { color: colors.error }]}>Borrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

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
    resumenHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 10 },
    resumenTitle: { fontSize: 17, fontWeight: "800", color: c.onSurface },
    fechaRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.divider, marginBottom: 14 },
    fechaLabel: { fontSize: 22, fontWeight: "500", color: c.onSurface },
    fechaRange: { fontSize: 12, color: c.onSurfaceTertiary, fontWeight: "600", marginTop: 2 },
    gearBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    pzBar: { backgroundColor: c.surfaceTertiary, borderRadius: 8, paddingVertical: 7, alignItems: "center", marginBottom: 10 },
    pzText: { fontSize: 15, fontWeight: "700", color: c.onSurface },
    menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", paddingTop: 90, alignItems: "flex-end", paddingRight: 16 },
    menuCard: { width: 260, backgroundColor: c.surface, borderRadius: 14, paddingVertical: 4, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
    menuHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.divider },
    menuHeadText: { fontSize: 15, fontWeight: "800", color: c.onSurface },
    menuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.divider },
    menuItemLast: { borderBottomWidth: 0 },
    menuItemText: { fontSize: 15, fontWeight: "600", color: c.onSurface },
    shareSavedBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: c.brandPrimary },
    shareSavedText: { color: c.brandPrimary, fontWeight: "800", fontSize: 14 },
    unitsBadge: { marginLeft: "auto", backgroundColor: c.brandPrimary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
    unitsBadgeText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
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
    detailDate: { fontSize: 12, fontWeight: "700", color: c.onSurface, width: 90 },
    detailMid: { fontSize: 12, color: c.onSurfaceTertiary, flex: 1 },
    detailPay: { fontSize: 13, fontWeight: "800", color: c.brandPrimary },
  });
