import React, { useMemo, useState } from "react";
import {
  ImageBackground, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { Sun, Moon, Search, ArrowLeft, Keyboard as KeyboardIcon, Camera as CameraIcon, LogOut, Users, Trash2, Flag, Loader } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { useSession, Session } from "@/src/api/session";
import { useOfflineActions } from "@/src/offline/useOfflineActions";
import { toast } from "@/src/components/Toast";
import QRScanner from "@/src/components/QRScanner";
import WorkerAutocomplete, { Worker } from "@/src/components/WorkerAutocomplete";
import { formatHHMM, formatHours, todayISO } from "@/src/utils/format";
import { useTheme, ThemeColors } from "@/src/theme";

const FIELD_BG = require("@/assets/images/field-bg.jpg");
const MODES: { k: Session["unitMode"]; label: string }[] = [
  { k: "pieza", label: "Pieza" }, { k: "libra", label: "Libra" }, { k: "horas", label: "Horas" },
];

function prettyDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }).replace(/\b\w/g, (c) => c.toUpperCase());
}
function elapsed(checkIn?: string | null) {
  if (!checkIn) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(checkIn).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function AsistenciaScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const qc = useQueryClient();
  const today = todayISO();
  const { session, save } = useSession();
  const { scanAttendance: scanOffline, createWorker } = useOfflineActions();

  const [view, setView] = useState<"hub" | "scan">("hub");
  const [scanMode, setScanMode] = useState<"checkin" | "checkout">("checkin");
  const [scanning, setScanning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [endDayOpen, setEndDayOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const mode = session.unitMode || "pieza";
  const checkout = scanMode === "checkout";
  const panelColor = checkout ? "#5A4A98" : "#2563EB";

  const parcelsQ = useQuery({ queryKey: ["parcels"], queryFn: async () => (await api.get("/parcels")).data as any[] });
  const productsQ = useQuery({ queryKey: ["products"], queryFn: async () => (await api.get("/products")).data as any[] });
  const workersQ = useQuery({ queryKey: ["workers"], queryFn: async () => (await api.get("/workers")).data as Worker[] });
  const attQ = useQuery({ queryKey: ["attendance", today], queryFn: async () => (await api.get("/attendance", { params: { date: today } })).data });
  const rows: any[] = attQ.data?.rows || [];
  useFocusEffect(React.useCallback(() => { attQ.refetch(); }, []));

  const presentCount = rows.filter((r) => r.check_in).length;
  const openCount = rows.filter((r) => r.check_in && !r.check_out).length;
  const salidaCount = presentCount - openCount;

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => (r.worker_name || "").toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const scanAttendance = (code: string) => scanOffline(code, today);

  const resolveParcel = async (name: string) => {
    if (!name) { save({ parcelId: "", ranchoName: "" }); return; }
    try {
      const existing = (parcelsQ.data || []).find((p) => p.name.toLowerCase() === name.toLowerCase());
      const parcel = existing || (await api.post("/parcels", { name })).data;
      if (!existing) parcelsQ.refetch();
      save({ parcelId: parcel.id, ranchoName: parcel.name });
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const resolveProduct = async (name: string) => {
    if (!name) { save({ productId: "", trabajoName: "" }); return; }
    try {
      const existing = (productsQ.data || []).find((p) => p.name.toLowerCase() === name.toLowerCase());
      const product = existing || (await api.post("/products", { name })).data;
      if (!existing) productsQ.refetch();
      save({ productId: product.id, trabajoName: product.name });
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const removeRow = async (id: string) => {
    try { await api.delete(`/attendance/${id}`); toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["attendance", today] }); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const confirmEndDay = async () => {
    setClosing(true);
    try {
      for (const r of rows.filter((r) => r.check_in && !r.check_out)) { try { await api.post("/attendance/scan", { code: r.worker_id, date: today }); } catch {} }
      toast.success("Día cerrado. Los registros quedaron guardados.");
      setEndDayOpen(false);
      qc.invalidateQueries({ queryKey: ["attendance", today] });
    } finally { setClosing(false); }
  };

  if (scanning) return <QRScanner onScan={(c) => scanAttendance(c)} onClose={() => setScanning(false)} title={checkout ? "Escanea la SALIDA" : "Escanea la ENTRADA"} />;

  // ===================== SCAN VIEW (Check in / Check out) =====================
  if (view === "scan") {
    const place = `${session.ranchoName || "—"}, ${session.trabajoName || "—"}`;
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.flex} keyboardVerticalOffset={70}>
        <ImageBackground source={FIELD_BG} style={s.flex} resizeMode="cover">
          <View style={s.fieldOverlay} />
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={[s.panel, { backgroundColor: panelColor }]}>
              {/* header */}
              <View style={s.panelHead}>
                <TouchableOpacity testID="scan-back" onPress={() => setView("hub")} style={s.headSide}>
                  <ArrowLeft size={20} color="#FFFFFF" /><Text style={s.headSideText}>Atrás</Text>
                </TouchableOpacity>
                <Text style={s.panelTitle}>{checkout ? "Check out" : "Check in"}</Text>
                <TouchableOpacity testID="scan-resumen" onPress={() => setEndDayOpen(true)}><Text style={s.headResumen}>Resumen</Text></TouchableOpacity>
              </View>

              {/* count + controls */}
              <View style={s.countRow}>
                <View>
                  <Text style={s.countLabel}>{checkout ? "CHECKED OUT" : "CHECKED IN"}</Text>
                  <Text style={s.countBig}>{checkout ? salidaCount : presentCount}</Text>
                </View>
                <View style={s.controls}>
                  <TouchableOpacity testID="ctrl-keyboard" onPress={() => setManualOpen((v) => !v)} style={s.ctrlCircle}><KeyboardIcon size={20} color="#1A2210" /></TouchableOpacity>
                  <TouchableOpacity testID="ctrl-camera" onPress={() => setScanning(true)} style={s.ctrlCircle}><CameraIcon size={20} color="#1A2210" /></TouchableOpacity>
                  {!checkout && MODES.map((m) => (
                    <TouchableOpacity key={m.k} testID={`mode-${m.k}`} onPress={() => save({ unitMode: m.k })} style={[s.modePill, mode === m.k ? s.modePillActive : s.modePillIdle]}>
                      <Text style={[s.modePillText, { color: mode === m.k ? "#FFFFFF" : "#1A2210" }]}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* action row */}
              <View style={s.actionRow}>
                {!checkout && (
                  <TouchableOpacity testID="move-crew" onPress={() => toast.info("Move Crew — próximamente")} style={s.moveCrew}>
                    <Users size={18} color="#1A2210" /><Text style={s.moveCrewText}>Move Crew</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity testID="scan-trigger" onPress={() => setScanning(true)} style={s.redCircle}><LogOut size={20} color="#DC2626" /></TouchableOpacity>
              </View>

              {manualOpen && (
                <View style={s.manualBox}>
                  <WorkerAutocomplete workers={(workersQ.data || []).filter((w) => w.active !== false)} onPick={(w) => scanAttendance(w.id)} createWorker={createWorker} placeholder="Buscar empleado por nombre" testID="asis-manual-input" />
                </View>
              )}

              {/* config cards */}
              <View style={s.cfgRow}>
                <View style={s.cfgCard}>
                  <View style={s.cfgLine}>
                    <FieldBox label="Rancho *" value={session.ranchoName || ""} onCommit={resolveParcel} testID="checkin-rancho" colors={colors} />
                    <FieldBox label="Block *" value={session.block || ""} onCommit={(v) => save({ block: v })} testID="checkin-block" colors={colors} />
                  </View>
                  <View style={s.cfgLine}>
                    <FieldBox label="Mayordomo" value={session.mayordomo || ""} onCommit={(v) => save({ mayordomo: v })} testID="checkin-mayordomo" colors={colors} />
                    <FieldBox label="Grower" value={session.grower || ""} onCommit={(v) => save({ grower: v })} testID="checkin-grower" colors={colors} />
                  </View>
                </View>
                <View style={s.cfgCard}>
                  <View style={s.cfgLine}>
                    <FieldBox label="Trabajo *" value={session.trabajoName || ""} onCommit={resolveProduct} testID="checkin-trabajo" colors={colors} />
                    <FieldBox label="Variedad *" value={session.variedad || ""} onCommit={(v) => save({ variedad: v })} testID="checkin-variedad" colors={colors} />
                  </View>
                  <View style={s.cfgLine}>
                    <FieldBox label="Precio *" value={session.pricePerUnit != null ? String(session.pricePerUnit) : ""} prefix="$" numeric onCommit={(v) => save({ pricePerUnit: v === "" ? "" : Number(v) })} testID="checkin-precio" colors={colors} />
                    <FieldBox label="Precio / hora" value={session.pricePerHour != null ? String(session.pricePerHour) : ""} prefix="$" numeric onCommit={(v) => save({ pricePerHour: v === "" ? "" : Number(v) })} testID="checkin-precio-hora" colors={colors} />
                  </View>
                </View>
              </View>
            </View>

            {/* attendance list over field bg */}
            <View style={s.listWrap}>
              {attQ.isLoading ? <View style={s.center}><Loader size={22} color="#FFFFFF" /></View> : rows.length === 0 ? (
                <Text style={s.listEmpty}>Sin registros aún. Escanea para empezar.</Text>
              ) : rows.map((r) => (
                <View key={r.id} style={s.attCard} testID={`attendance-row-${r.id}`}>
                  <View style={s.attHora}>
                    <Text style={s.attHoraLabel}>HORA</Text>
                    <Text style={s.attHoraVal}>{formatHHMM(checkout ? r.check_out : r.check_in) || "—"}</Text>
                    {!checkout && r.check_out ? <Text style={s.attOut}>↓ {formatHHMM(r.check_out)}</Text> : null}
                  </View>
                  <View style={s.attEmp}>
                    <Text style={s.attEmpLabel}>EMPLEADO</Text>
                    <Text style={s.attEmpName}>{r.worker_name}</Text>
                    <Text style={s.attPlace} numberOfLines={1}>{place}</Text>
                  </View>
                  {!checkout && (
                    <TouchableOpacity testID={`attendance-delete-${r.id}`} onPress={() => removeRow(r.id)} style={s.attDel}><Trash2 size={18} color="#DC2626" /></TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
          {endDayOpen && <EndDaySheet present={presentCount} open={openCount} salida={salidaCount} closing={closing} onConfirm={confirmEndDay} onClose={() => setEndDayOpen(false)} colors={colors} />}
        </ImageBackground>
      </KeyboardAvoidingView>
    );
  }

  // ===================== HUB VIEW =====================
  return (
    <View style={[s.flex, { backgroundColor: colors.surfaceSecondary }]}>
      <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={s.navy} testID="asistencia-hub">
          <Text style={s.date}>{prettyDate(today)}</Text>
          <View style={s.iconTiles}>
            <TouchableOpacity testID="tile-check-in" onPress={() => { setScanMode("checkin"); setManualOpen(false); setView("scan"); }} style={s.iconTile} activeOpacity={0.8}>
              <Sun size={88} color="#60A5FA" strokeWidth={2.2} />
              {presentCount > 0 && <View style={s.iconBadge}><Text style={s.iconBadgeText}>{presentCount}</Text></View>}
              <Text style={s.iconTileLabel}>Check in</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="tile-check-out" onPress={() => { setScanMode("checkout"); setManualOpen(false); setView("scan"); }} style={s.iconTile} activeOpacity={0.8}>
              <Moon size={84} color="#A79FE0" strokeWidth={2.2} />
              {openCount > 0 && <View style={s.iconBadge}><Text style={s.iconBadgeText}>{openCount}</Text></View>}
              <Text style={s.iconTileLabel}>Check out</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity testID="end-day-button" onPress={() => setEndDayOpen(true)} style={s.endDay}>
            <Flag size={16} color="#111827" /><Text style={s.endDayText}>Finalizar día · ver resumen y reiniciar</Text>
          </TouchableOpacity>
        </View>

        <View style={s.lower}>
          <TouchableOpacity testID="hub-search-button" onPress={() => setShowSearch((v) => !v)} style={s.searchBtn}><Search size={20} color="#1E2746" strokeWidth={2.5} /></TouchableOpacity>
          {showSearch && <TextInput testID="hub-search-input" value={search} onChangeText={setSearch} placeholder="Buscar empleado…" placeholderTextColor={colors.muted} style={s.searchInput} autoFocus />}
          <View style={s.stats}>
            <MiniStat label="Entrada" value={presentCount} color="#2563EB" colors={colors} />
            <MiniStat label="En campo" value={openCount} color="#1D4ED8" colors={colors} />
            <MiniStat label="Salida" value={salidaCount} color="#DC2626" colors={colors} />
          </View>
          {attQ.isLoading ? <View style={s.center}><Loader size={24} color={colors.brandPrimary} /></View>
            : visibleRows.length === 0 ? (
              <View style={s.empty} testID="hub-empty">
                <Text style={s.emptyTitle}>Sin asistencia hoy.</Text>
                <Text style={s.emptySub}>Toca <Text style={{ fontWeight: "800" }}>Check in</Text> para registrar entradas.</Text>
              </View>
            ) : visibleRows.map((r) => <HubRow key={r.id || r.worker_id} r={r} onCheckout={scanAttendance} colors={colors} />)}
        </View>
      </ScrollView>
      {endDayOpen && view === "hub" && <EndDaySheet present={presentCount} open={openCount} salida={salidaCount} closing={closing} onConfirm={confirmEndDay} onClose={() => setEndDayOpen(false)} colors={colors} />}
    </View>
  );
}

function FieldBox({ label, value, onCommit, prefix, numeric, testID, colors }: { label: string; value: string; onCommit: (v: string) => void; prefix?: string; numeric?: boolean; testID: string; colors: ThemeColors }) {
  const s = styles(colors);
  const [val, setVal] = useState(value);
  React.useEffect(() => { setVal(value); }, [value]);
  return (
    <View style={s.fieldBox}>
      <Text style={s.fieldBoxLabel}>{label}</Text>
      <View style={s.fieldBoxInputRow}>
        {prefix ? <Text style={s.fieldPrefix}>{prefix}</Text> : null}
        <TextInput
          testID={testID}
          value={val}
          onChangeText={(t) => setVal(numeric ? t.replace(/[^0-9.]/g, "") : t)}
          onBlur={() => onCommit(val.trim())}
          placeholder="—"
          placeholderTextColor="#B9B3A5"
          keyboardType={numeric ? "decimal-pad" : "default"}
          style={s.fieldBoxInput}
        />
      </View>
    </View>
  );
}

function MiniStat({ label, value, color, colors }: { label: string; value: number; color: string; colors: ThemeColors }) {
  const s = styles(colors);
  return <View style={s.miniStat}><Text style={s.miniLabel}>{label}</Text><Text style={[s.miniVal, { color }]}>{value}</Text></View>;
}

function HubRow({ r, onCheckout, colors }: { r: any; onCheckout: (code: string) => void; colors: ThemeColors }) {
  const s = styles(colors);
  const open = r.check_in && !r.check_out;
  const shortId = String(r.worker_id || "").slice(-3) || "—";
  return (
    <View style={s.hubRow} testID={`hub-row-${r.id || r.worker_id}`}>
      <View style={s.avatar}><Text style={s.avatarText}>{shortId}</Text></View>
      <View style={s.flex}>
        <Text style={s.hubName} numberOfLines={1}>{r.worker_name}</Text>
        <Text style={s.hubTime}>{formatHHMM(r.check_in) || "—"}{formatHHMM(r.check_out) ? ` → ${formatHHMM(r.check_out)}` : " →"}</Text>
      </View>
      <View style={s.hubRight}>
        <Text style={s.hubJornadaLabel}>{open ? "EN CAMPO" : "JORNADA"}</Text>
        <Text style={[s.hubJornada, { color: open ? "#1D4ED8" : "#5A4A98" }]}>{open ? elapsed(r.check_in) : (r.hours ? formatHours(r.hours) : "—")}</Text>
      </View>
      {open ? (
        <TouchableOpacity testID={`hub-checkout-${r.id || r.worker_id}`} onPress={() => onCheckout(r.worker_id)} style={s.salidaBtn}><Text style={s.salidaText}>Salida</Text></TouchableOpacity>
      ) : <View style={s.hubDot} />}
    </View>
  );
}

function EndDaySheet({ present, open, salida, closing, onConfirm, onClose, colors }: { present: number; open: number; salida: number; closing: boolean; onConfirm: () => void; onClose: () => void; colors: ThemeColors }) {
  const s = styles(colors);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalWrap}>
        <View style={s.sheet} testID="end-day-sheet">
          <Text style={s.sheetTitle}>Finalizar jornada</Text>
          <Text style={s.sheetSub}>Al confirmar se cerrarán las {open} jornada(s) abiertas. Rancho, Trabajo y Precio se mantienen.</Text>
          <View style={s.summaryRow}>
            <View style={s.summaryCell}><Text style={s.summaryLabel}>Entrada</Text><Text style={s.summaryVal}>{present}</Text></View>
            <View style={s.summaryCell}><Text style={s.summaryLabel}>En campo</Text><Text style={s.summaryVal}>{open}</Text></View>
            <View style={s.summaryCell}><Text style={s.summaryLabel}>Salida</Text><Text style={s.summaryVal}>{salida}</Text></View>
          </View>
          <View style={s.sheetBtns}>
            <TouchableOpacity testID="end-day-cancel" onPress={onClose} style={[s.sheetBtn, { backgroundColor: colors.surfaceSecondary }]}><Text style={[s.sheetBtnText, { color: colors.onSurfaceTertiary }]}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity testID="end-day-confirm" onPress={onConfirm} disabled={closing} style={[s.sheetBtn, { backgroundColor: colors.brandSecondary }]}><Text style={s.sheetBtnText}>{closing ? "..." : "Confirmar"}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    center: { paddingVertical: 28, alignItems: "center" },
    // hub
    navy: { backgroundColor: "#FFFFFF", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18, borderBottomWidth: 2, borderBottomColor: "#9CA3AF" },
    date: { color: "#4B5563", fontWeight: "700", fontSize: 14, textTransform: "capitalize" },
    iconTiles: { flexDirection: "row", marginTop: 16 },
    iconTile: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 18 },
    iconTileLabel: { color: "#111827", fontWeight: "800", fontSize: 16, marginTop: 14 },
    iconBadge: { position: "absolute", top: 6, right: "28%", minWidth: 28, height: 28, borderRadius: 14, backgroundColor: "#1D4ED8", paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
    iconBadgeText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
    endDay: { marginTop: 10, height: 50, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D1D5DB", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    endDayText: { color: "#111827", fontWeight: "700", fontSize: 13 },
    lower: { backgroundColor: "#E5E7EB", paddingTop: 0, paddingBottom: 10, minHeight: 340 },
    searchBtn: { alignSelf: "flex-end", marginRight: 16, marginVertical: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center" },
    searchInput: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 12, height: 46, paddingHorizontal: 14, fontSize: 15, color: c.onSurface, marginHorizontal: 16, marginBottom: 10 },
    stats: { flexDirection: "row", backgroundColor: "#FFFFFF", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#D1D5DB", marginBottom: 0 },
    miniStat: { flex: 1, backgroundColor: "#FFFFFF", borderLeftWidth: 1, borderLeftColor: "#D1D5DB", paddingHorizontal: 16, paddingVertical: 10 },
    miniLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, color: "#889078" },
    miniVal: { fontSize: 22, fontWeight: "800", marginTop: 2 },
    empty: { backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#D1D5DB", paddingVertical: 36, alignItems: "center" },
    emptyTitle: { color: "#889078", fontWeight: "800", fontSize: 15 },
    emptySub: { color: "#889078", fontSize: 12, marginTop: 4 },
    hubRow: { backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#D1D5DB", paddingHorizontal: 20, paddingVertical: 14, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center" },
    avatarText: { color: "#1E2746", fontWeight: "800", fontSize: 13, fontVariant: ["tabular-nums"] },
    hubName: { fontWeight: "800", color: "#1A2210", fontSize: 15 },
    hubTime: { fontSize: 11, color: "#889078", fontWeight: "700", marginTop: 2, fontVariant: ["tabular-nums"] },
    hubRight: { alignItems: "flex-end" },
    hubJornadaLabel: { fontSize: 9, color: "#889078", fontWeight: "800", letterSpacing: 0.5 },
    hubJornada: { fontSize: 15, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] },
    hubDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#5A4A98" },
    salidaBtn: { height: 38, paddingHorizontal: 14, backgroundColor: "#DC2626", borderRadius: 12, alignItems: "center", justifyContent: "center" },
    salidaText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
    // scan view
    fieldOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(247,245,238,0.55)" },
    panel: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
    panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headSide: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 80 },
    headSideText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
    panelTitle: { color: "#111827", fontWeight: "900", fontSize: 22 },
    headResumen: { color: "#FFFFFF", fontWeight: "700", fontSize: 16, minWidth: 80, textAlign: "right" },
    countRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginTop: 12 },
    countLabel: { color: "#1A2210", fontWeight: "800", fontSize: 12, letterSpacing: 0.5 },
    countBig: { color: "#111827", fontWeight: "900", fontSize: 54, lineHeight: 58 },
    controls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end", marginLeft: 12 },
    ctrlCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
    modePill: { height: 48, paddingHorizontal: 18, borderRadius: 24, alignItems: "center", justifyContent: "center" },
    modePillActive: { backgroundColor: "#1A2210" },
    modePillIdle: { backgroundColor: "#FFFFFF" },
    modePillText: { fontWeight: "800", fontSize: 15 },
    actionRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
    moveCrew: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFFFFF", height: 50, paddingHorizontal: 20, borderRadius: 25, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
    moveCrewText: { color: "#1A2210", fontWeight: "800", fontSize: 16 },
    redCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
    manualBox: { marginTop: 14, backgroundColor: "rgba(255,255,255,0.0)" },
    cfgRow: { flexDirection: "row", gap: 12, marginTop: 16 },
    cfgCard: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 20, padding: 10, gap: 10 },
    cfgLine: { flexDirection: "row", gap: 10 },
    fieldBox: { flex: 1, backgroundColor: "#F3F1E9", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
    fieldBoxLabel: { fontSize: 10, fontWeight: "800", color: "#889078", textTransform: "uppercase", letterSpacing: 0.5 },
    fieldBoxInputRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
    fieldPrefix: { fontSize: 18, fontWeight: "800", color: "#1A2210", marginRight: 2 },
    fieldBoxInput: { flex: 1, fontSize: 18, fontWeight: "700", color: "#1A2210", padding: 0 },
    listWrap: { paddingHorizontal: 16, paddingTop: 16 },
    listEmpty: { color: "#1A2210", fontWeight: "700", textAlign: "center", paddingVertical: 20 },
    attCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
    attHora: { minWidth: 74 },
    attHoraLabel: { fontSize: 10, fontWeight: "800", color: "#889078", textTransform: "uppercase", letterSpacing: 0.5 },
    attHoraVal: { fontSize: 20, fontWeight: "800", color: "#1A2210", marginTop: 2 },
    attOut: { fontSize: 12, fontWeight: "800", color: "#DC2626", marginTop: 2 },
    attEmp: { flex: 1, borderLeftWidth: 1, borderLeftColor: "#D1D5DB", paddingLeft: 12 },
    attEmpLabel: { fontSize: 10, fontWeight: "800", color: "#889078", textTransform: "uppercase", letterSpacing: 0.5 },
    attEmpName: { fontSize: 17, fontWeight: "800", color: "#1A2210", marginTop: 2 },
    attPlace: { fontSize: 13, fontWeight: "600", color: "#556047", marginTop: 2 },
    attDel: { padding: 6 },
    // modal
    modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    sheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
    sheetTitle: { fontSize: 20, fontWeight: "800", color: c.onSurface, textAlign: "center" },
    sheetSub: { fontSize: 13, color: c.onSurfaceTertiary, textAlign: "center", marginTop: 8, marginBottom: 16, lineHeight: 19 },
    summaryRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
    summaryCell: { flex: 1, backgroundColor: "#E5E7EB", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 12, paddingVertical: 10, alignItems: "center" },
    summaryLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", color: "#889078" },
    summaryVal: { fontSize: 20, fontWeight: "800", color: c.onSurface, marginTop: 2 },
    sheetBtns: { flexDirection: "row", gap: 12 },
    sheetBtn: { flex: 1, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    sheetBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  });
