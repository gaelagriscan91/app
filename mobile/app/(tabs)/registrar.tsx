import React, { useMemo, useState } from "react";
import {
  ImageBackground, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { QrCode, X, Printer, Trash2, ArrowLeft, UserPlus, Loader } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { useSession } from "@/src/api/session";
import { useOfflineActions } from "@/src/offline/useOfflineActions";
import { toast } from "@/src/components/Toast";
import QRScanner from "@/src/components/QRScanner";
import { formatCurrency, fmtStamp, todayISO, unitOf, TIPO } from "@/src/utils/format";
import { printWorkerTicket } from "@/src/utils/print";
import { useTheme, ThemeColors } from "@/src/theme";

const MAX_TEAM = 6;
const FIELD_BG = require("@/assets/images/field-bg.jpg");
type Worker = { id: string; name: string; active?: boolean };

export default function RegistrarScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const router = useRouter();
  const qc = useQueryClient();
  const today = todayISO();
  const { session, save } = useSession();
  const { saveHarvest, createWorker } = useOfflineActions();

  const [team, setTeam] = useState<Worker[]>([]);
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [view, setView] = useState<"scan" | "records">("scan");

  const mode = session.unitMode || "pieza";
  const price = Number(mode === "horas" ? session.pricePerHour : session.pricePerUnit) || 0;
  const setupReady = !!session.parcelId && !!session.productId && price > 0;

  // Pieza se cuenta de a 1 por defecto; libra/horas se escriben a mano.
  React.useEffect(() => {
    setQty((q) => (mode === "pieza" ? (q === "" ? "1" : q) : q === "1" ? "" : q));
  }, [mode]);

  const workersQ = useQuery({ queryKey: ["workers"], queryFn: async () => (await api.get("/workers")).data as Worker[] });
  const workers = (workersQ.data || []).filter((w) => w.active !== false);

  const rowsQ = useQuery({
    queryKey: ["harvests-today", today],
    queryFn: async () => {
      const { data } = await api.get("/harvests", { params: { date_from: today, date_to: today } });
      return [...(data || [])].sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    },
  });
  const rows = rowsQ.data || [];
  useFocusEffect(React.useCallback(() => { rowsQ.refetch(); }, []));

  const requireSetup = () => { toast.error("Completa primero el Check in (Rancho, Trabajo y Precio)"); router.push("/(tabs)/asistencia"); };
  const openScanner = () => { if (!setupReady) return requireSetup(); setScanning(true); };

  const addToTeam = (w: Worker) => {
    if (!setupReady) return requireSetup();
    setTeam((t) => {
      if (t.some((x) => x.id === w.id)) { toast.info(`${w.name} ya está en esta pieza`); return t; }
      if (t.length >= MAX_TEAM) { toast.error(`Máximo ${MAX_TEAM} empleados`); return t; }
      return [...t, { id: w.id, name: w.name }];
    });
  };

  const onScan = async (code: string) => {
    setScanning(false);
    try { const { data } = await api.post("/workers/resolve", { code }); addToTeam({ id: data.id, name: data.name }); }
    catch { toast.error("QR no registrado"); }
  };

  const save_ = async () => {
    const total = Number(qty);
    if (!team.length || !(total > 0)) { toast.error("Agrega un empleado y la cantidad"); return; }
    const units = Math.round((total / team.length) * 10000) / 10000;
    setSaving(true);
    try {
      let pendingAny = false;
      for (const w of team) {
        const res = await saveHarvest({
          worker_id: w.id, parcel_id: session.parcelId, product_id: session.productId,
          kilos: 0, units, price_per_kg: 0, price_per_unit: price,
          price_mode: mode === "horas" ? "hour" : "piece", unit_type: mode,
          date: today, photo_path: "", notes: team.length > 1 ? `Pieza compartida entre ${team.length}` : "Cosecha escaneada",
          block: session.block || "", variety: session.variedad || "",
          mayordomo: (session.mayordomo || "").trim(), grower: (session.grower || "").trim(),
        }, { workerName: w.name, today });
        if (res.pending) pendingAny = true;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(pendingAny
        ? `Guardado sin conexión: ${total}${team.length > 1 ? ` entre ${team.length}` : ""}`
        : team.length > 1 ? `Guardado: ${total} entre ${team.length}` : `Guardado: ${team[0].name} · ${total}`);
      setTeam([]); setQty(mode === "pieza" ? "1" : "");
    } catch (e) { toast.error(apiErrorMessage(e, "No se pudo guardar")); }
    finally { setSaving(false); }
  };

  const remove = async (h: any) => {
    const prev = rows;
    qc.setQueryData(["harvests-today", today], rows.filter((r: any) => r.id !== h.id));
    try { await api.delete(`/harvests/${h.id}`); toast.success("Escaneo borrado"); }
    catch (e) { qc.setQueryData(["harvests-today", today], prev); toast.error(apiErrorMessage(e)); }
  };
  const print = async (h: any) => { try { await printWorkerTicket(h, rows); } catch { toast.error("No se pudo imprimir"); } };

  const dayTotal = useMemo(() => {
    const label = (TIPO[mode] || "Pieza").toLowerCase();
    const mine = rows.filter((r: any) => unitOf(r) === label);
    return Math.round(mine.reduce((acc: number, r: any) => acc + Number(r.units || 0), 0) * 100) / 100;
  }, [rows, mode]);

  if (scanning) return <QRScanner onScan={onScan} onClose={() => setScanning(false)} />;

  return (
    <ImageBackground source={FIELD_BG} style={s.flex} resizeMode="cover">
      <View style={s.overlay} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.flex} keyboardVerticalOffset={110}>
        {view === "records" ? (
          <ScrollView style={s.flex} contentContainerStyle={s.recScroll}>
            <TouchableOpacity testID="records-back" onPress={() => setView("scan")} style={s.back}>
              <ArrowLeft size={18} color={colors.brandPrimary} /><Text style={s.backText}>Registrar</Text>
            </TouchableOpacity>
            {rowsQ.isLoading ? (
              <View style={s.center}><Loader size={24} color={colors.brandPrimary} /></View>
            ) : rows.length === 0 ? <Text style={s.empty}>Sin registros hoy</Text> : rows.map((h: any) => (
              <View key={h.id} style={s.recRow} testID={`quick-record-${h.id}`}>
                <View style={s.flex}>
                  <Text style={s.recName}>{h.worker_name}</Text>
                  <Text style={s.recTime}>{fmtStamp(h)}</Text>
                  <Text style={s.recDetail}>{h.units} {unitOf(h)} · {formatCurrency(h.price_per_unit)} c/u</Text>
                </View>
                <View style={s.recRight}><Text style={s.recLabel}>GANÓ</Text><Text style={s.recPay} testID={`record-pay-${h.id}`}>{formatCurrency(h.payment)}</Text></View>
                <TouchableOpacity testID={`record-print-${h.id}`} onPress={() => print(h)} style={s.recIcon}><Printer size={20} color={colors.brandPrimary} /></TouchableOpacity>
                <TouchableOpacity testID={`record-delete-${h.id}`} onPress={() => remove(h)} style={s.recIcon}><Trash2 size={20} color={colors.error} /></TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={s.flex}>
            <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
              {/* Empleado */}
              <View style={s.row} testID="quick-employee">
                <Text style={s.rowLabel}>Empleado</Text>
                <View style={s.rowRightWrap}>
                  {team.length < MAX_TEAM ? (
                    <EmployeeInput
                      workers={workers.filter((w) => !team.some((t) => t.id === w.id))}
                      onPick={addToTeam}
                      onCreateWorker={createWorker}
                      requireSetup={!setupReady ? requireSetup : undefined}
                    />
                  ) : <Text style={s.maxText}>Máximo {MAX_TEAM}</Text>}
                  {team.length > 0 && team.length < MAX_TEAM && (
                    <TouchableOpacity testID="quick-scan-more" onPress={openScanner} style={s.scanMore}><QrCode size={18} color="#FFFFFF" /></TouchableOpacity>
                  )}
                </View>
              </View>
              {team.length > 0 && (
                <View style={s.teamRow} testID="quick-team">
                  {team.map((w) => (
                    <View key={w.id} style={s.pill} testID={`quick-team-${w.id}`}>
                      <Text style={s.pillText}>{w.name}</Text>
                      <TouchableOpacity testID={`quick-team-remove-${w.id}`} onPress={() => setTeam((t) => t.filter((x) => x.id !== w.id))}><X size={15} color={colors.onSurfaceTertiary} /></TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Cantidad — solo aparece cuando hay empleado seleccionado */}
              {team.length > 0 && (
                <View style={s.row} testID="quick-qty-row">
                  <Text style={s.rowLabel}>Cantidad</Text>
                  <View style={s.rowRightWrap}>
                    {team.length > 1 && Number(qty) > 0 && (
                      <Text style={s.splitInfo} testID="quick-split-info">÷ {team.length} = {Math.round((Number(qty) / team.length) * 100) / 100} c/u</Text>
                    )}
                    <TextInput
                      testID="quick-qty-input"
                      value={qty}
                      onChangeText={(t) => setQty(t.replace(/[^0-9.]/g, ""))}
                      keyboardType="decimal-pad"
                      placeholder="Cantidad"
                      placeholderTextColor="#C4C4C4"
                      style={s.qtyInput}
                    />
                  </View>
                </View>
              )}

              <View style={{ height: 20 }} />
              <ValueRow label="Precio" value={formatCurrency(price)} testID="quick-price" colors={colors} />
              <View style={{ height: 8 }} />
              <ValueRow label="Tipo" value={TIPO[mode] || "Pieza"} testID="quick-type" colors={colors} />
              <View style={{ height: 8 }} />

              <FieldRow label="Mayordomo" initial={session.mayordomo || ""} onCommit={(v) => save({ mayordomo: v })} testID="quick-mayordomo-input" colors={colors} />
              <FieldRow label="Grower" initial={session.grower || ""} onCommit={(v) => save({ grower: v })} testID="quick-grower-input" colors={colors} />

              <View style={s.dayPill} testID="quick-day-totals">
                <Text style={s.dayPillLabel}>{TIPO[mode] || "Pieza"}</Text>
                <Text style={s.dayPillVal} testID="quick-total-qty">{dayTotal}</Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              testID={team.length ? "quick-save-button" : "quick-scan-button"}
              onPress={team.length ? save_ : openScanner}
              disabled={saving}
              activeOpacity={0.85}
              style={[s.fab, { opacity: saving ? 0.7 : 1 }]}
            >
              {saving ? <Loader size={32} color="#FFFFFF" /> : team.length ? <Text style={s.fabText}>SAVE</Text> : <QrCode size={42} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity testID="quick-records-tab" onPress={() => setView(view === "records" ? "scan" : "records")} style={s.recordsBar}>
          <Printer size={28} color={view === "records" ? colors.brandPrimary : colors.muted} strokeWidth={1.5} />
          <Text style={[s.recordsText, { color: view === "records" ? colors.brandPrimary : colors.muted }]}>Records</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

function ValueRow({ label, value, testID, colors }: { label: string; value: string; testID: string; colors: ThemeColors }) {
  const s = styles(colors);
  return (
    <View style={s.row} testID={testID}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function FieldRow({ label, initial, onCommit, testID, colors }: { label: string; initial: string; onCommit: (v: string) => void; testID: string; colors: ThemeColors }) {
  const s = styles(colors);
  const [val, setVal] = useState(initial);
  React.useEffect(() => { setVal(initial); }, [initial]);
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={val}
        onChangeText={setVal}
        onBlur={() => onCommit(val.trim())}
        placeholder={label}
        placeholderTextColor="#C4C4C4"
        style={s.fieldInput}
      />
    </View>
  );
}

function EmployeeInput({ workers, onPick, onCreateWorker, requireSetup }: { workers: Worker[]; onPick: (w: Worker) => void; onCreateWorker: (name: string) => Promise<{ id: string; name: string }>; requireSetup?: () => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const q = text.trim().toLowerCase();
  const matches = useMemo(() => (q ? workers.filter((w) => w.name.toLowerCase().includes(q)).slice(0, 6) : []), [q, workers]);
  const exact = workers.some((w) => w.name.toLowerCase() === q);

  const pick = (w: Worker) => { if (requireSetup) return requireSetup(); onPick(w); setText(""); setOpen(false); };
  const createNew = async () => {
    if (requireSetup) return requireSetup();
    try { const w = await onCreateWorker(text.trim()); onPick({ id: w.id, name: w.name }); setText(""); setOpen(false); }
    catch {}
  };

  return (
    <View style={s.empWrap}>
      <TextInput
        testID="quick-employee-input"
        value={text}
        onChangeText={(t) => { setText(t); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Empleado"
        placeholderTextColor="#C4C4C4"
        style={s.empInput}
      />
      {open && q ? (
        <View style={s.empDropdown}>
          {matches.map((w) => (
            <TouchableOpacity key={w.id} onPress={() => pick(w)} style={s.empOption} testID={`quick-employee-option-${w.id}`}><Text style={s.empOptionText}>{w.name}</Text></TouchableOpacity>
          ))}
          {!exact ? (
            <TouchableOpacity onPress={createNew} style={[s.empOption, s.empCreate]} testID="quick-employee-create">
              <UserPlus size={16} color={colors.brandPrimary} /><Text style={[s.empOptionText, { color: colors.brandPrimary, fontWeight: "800" }]}>Agregar "{text.trim()}"</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.32)" },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#ECECEC", backgroundColor: "#FFFFFF" },
    rowLabel: { fontSize: 17, color: "#4B5563" },
    rowValue: { fontSize: 17, color: "#111827" },
    rowRightWrap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" },
    maxText: { fontSize: 14, color: c.muted },
    scanMore: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
    teamRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", backgroundColor: "#FFFFFF", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#ECECEC" },
    pill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EEF6DD", borderRadius: 999, paddingLeft: 12, paddingRight: 8, paddingVertical: 6 },
    pillText: { color: "#111827", fontSize: 15 },
    splitInfo: { fontSize: 12, color: c.muted },
    qtyInput: { minWidth: 90, textAlign: "right", fontSize: 19, color: "#111827", padding: 0 },
    fieldInput: { flex: 1, textAlign: "right", fontSize: 17, color: "#111827", padding: 0 },
    dayPill: { alignSelf: "flex-start", margin: 16, backgroundColor: "#FFFFFF", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", gap: 16, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    dayPillLabel: { fontSize: 14, color: "#111827" },
    dayPillVal: { fontSize: 14, fontWeight: "800", color: "#111827" },
    fab: { position: "absolute", right: 20, bottom: 20, width: 84, height: 84, borderRadius: 42, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
    fabText: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
    recordsBar: { backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingVertical: 10, alignItems: "center" },
    recordsText: { fontSize: 14, marginTop: 2 },
    // employee input
    empWrap: { flex: 1, position: "relative", zIndex: 40 },
    empInput: { textAlign: "right", fontSize: 17, color: "#111827", padding: 0 },
    empDropdown: { position: "absolute", top: 34, right: 0, minWidth: 220, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, overflow: "hidden", zIndex: 50, elevation: 8, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    empOption: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", flexDirection: "row", alignItems: "center", gap: 8 },
    empCreate: { backgroundColor: "#EFF6FF" },
    empOptionText: { fontSize: 15, color: "#111827" },
    // records
    recScroll: { paddingBottom: 20 },
    back: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
    backText: { color: c.brandPrimary, fontWeight: "800", fontSize: 15 },
    center: { paddingVertical: 40, alignItems: "center" },
    empty: { textAlign: "center", color: "#4B5563", fontWeight: "600", paddingVertical: 32 },
    recRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#ECECEC", paddingHorizontal: 16, paddingVertical: 12 },
    recName: { fontWeight: "800", color: "#111827", fontSize: 15 },
    recTime: { fontSize: 11, color: c.muted, marginTop: 1 },
    recDetail: { fontSize: 12, color: "#4B5563", marginTop: 1 },
    recRight: { alignItems: "flex-end", marginRight: 4 },
    recLabel: { fontSize: 9, color: c.muted, fontWeight: "700" },
    recPay: { fontWeight: "800", color: c.success, fontSize: 15 },
    recIcon: { padding: 8 },
  });
