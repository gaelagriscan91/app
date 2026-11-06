import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SvgXml } from "react-native-svg";
import { UserPlus, Printer, QrCode, Pencil, Trash2, X } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { Card, EmptyState, FlatGroup, FlatRow, Loading } from "@/src/components/ui";
import { useOfflineActions } from "@/src/offline/useOfflineActions";
import { qrSvg, printAllQR } from "@/src/utils/qr";
import { useTheme, ThemeColors } from "@/src/theme";

type W = { id: string; name: string; qr_code?: string; active?: boolean; role?: string; document_id?: string };

export default function WorkersModule() {
  const { colors } = useTheme();
  const s = styles(colors);
  const qc = useQueryClient();
  const { createWorker } = useOfflineActions();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<W | null>(null);
  const [qrView, setQrView] = useState<{ worker: W; svg: string } | null>(null);
  const [printing, setPrinting] = useState(false);

  const q = useQuery({ queryKey: ["workers"], queryFn: async () => (await api.get("/workers")).data as W[] });
  const workers = q.data || [];

  const add = async () => {
    if (!name.trim()) return;
    try {
      await createWorker(name.trim());
      setName(""); setShowForm(false);
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.put(`/workers/${editing.id}`, { name: editing.name.trim(), document_id: editing.document_id || "", role: editing.role || "Cosechador", active: editing.active !== false });
      toast.success("Empleado actualizado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["workers"] });
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const remove = async (w: W) => {
    try { await api.delete(`/workers/${w.id}`); toast.success("Empleado eliminado"); qc.invalidateQueries({ queryKey: ["workers"] }); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const printOne = async (w: W) => {
    if (!w.qr_code) { toast.info("Este empleado aún no tiene QR (pendiente de sincronizar)"); return; }
    try { await printAllQR([w]); }
    catch { toast.error("No se pudo imprimir el QR"); }
  };

  const printAll = async () => {
    const withQr = workers.filter((w) => w.qr_code);
    if (!withQr.length) { toast.error("No hay QR para imprimir"); return; }
    setPrinting(true);
    try { await printAllQR(withQr); }
    catch { toast.error("No se pudo imprimir"); }
    finally { setPrinting(false); }
  };

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <TouchableOpacity testID="worker-add-button" onPress={() => setShowForm((v) => !v)} style={s.primaryBtn}>
        <UserPlus size={20} color="#FFFFFF" /><Text style={s.primaryText}>Agregar empleado</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="worker-print-all" onPress={printAll} disabled={printing} style={s.outlineBtn}>
        <Printer size={20} color={colors.brandPrimary} /><Text style={s.outlineText}>{printing ? "Preparando…" : "Imprimir todos los QR"}</Text>
      </TouchableOpacity>

      {showForm && (
        <Card style={{ marginBottom: 14 }}>
          <Text style={s.formLabel}>Nombre completo</Text>
          <TextInput testID="worker-name-input" value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={colors.muted} style={s.input} />
          <TouchableOpacity testID="worker-save-new" onPress={add} style={[s.primaryBtn, { marginTop: 12, marginBottom: 0 }]}><Text style={s.primaryText}>Guardar</Text></TouchableOpacity>
        </Card>
      )}

      {q.isLoading ? <Loading /> : workers.length === 0 ? <EmptyState text="Aún no tienes empleados" /> : <FlatGroup style={s.flatList}>{workers.map((w) => (
        <FlatRow key={w.id} style={s.flatRow} testID={`worker-${w.id}`}>
          <View style={[s.flex, { paddingRight: 10 }]}>
            <Text style={s.name}>{w.name}</Text>
            <Text style={s.sub}>{w.role || "Cosechador"} · {w.document_id ? `SS# ${w.document_id}` : "sin SS#"}</Text>
            {w.qr_code ? <Text style={s.code}>{w.qr_code}</Text> : <Text style={s.pendingCode}>Pendiente de sincronizar</Text>}
          </View>
          <View style={[s.pill, { backgroundColor: w.active !== false ? "#DBEAFE" : "#FEE2E2" }]}>
            <Text style={[s.pillText, { color: w.active !== false ? "#1E40AF" : "#B91C1C" }]}>{w.active !== false ? "Activo" : "Inactivo"}</Text>
          </View>
          <TouchableOpacity testID={`worker-qr-${w.id}`} onPress={() => printOne(w)} style={s.iconBtn}><Printer size={20} color={colors.onSurface} /></TouchableOpacity>
          <TouchableOpacity testID={`worker-edit-${w.id}`} onPress={() => setEditing({ ...w })} style={s.iconBtn}><Pencil size={19} color={colors.brandPrimary} /></TouchableOpacity>
          <TouchableOpacity testID={`worker-delete-${w.id}`} onPress={() => remove(w)} style={[s.iconBtn, s.iconBtnLast]}><Trash2 size={19} color={colors.error} /></TouchableOpacity>
        </FlatRow>
      ))}</FlatGroup>}
      <View style={{ height: 24 }} />

      {/* QR view modal */}
      <Modal visible={!!qrView} transparent animationType="fade" onRequestClose={() => setQrView(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setQrView(null)} style={s.modalWrap}>
          <View style={s.qrCard} testID="worker-qr-modal">
            <Text style={s.qrName}>{qrView?.worker.name}</Text>
            {qrView ? <SvgXml xml={qrView.svg} width={200} height={200} /> : null}
            <Text style={s.qrCode}>{qrView?.worker.qr_code}</Text>
            <TouchableOpacity onPress={() => setQrView(null)} style={s.qrClose}><Text style={s.qrCloseText}>Cerrar</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit modal */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={s.modalBottom}>
          <View style={s.sheet}>
            <View style={s.sheetHead}><Text style={s.sheetTitle}>Editar empleado</Text><TouchableOpacity onPress={() => setEditing(null)}><X size={22} color={colors.onSurface} /></TouchableOpacity></View>
            <Text style={s.formLabel}>Nombre</Text>
            <TextInput testID="edit-name" value={editing?.name || ""} onChangeText={(t) => setEditing((e) => e && { ...e, name: t })} style={s.input} placeholderTextColor={colors.muted} />
            <Text style={[s.formLabel, { marginTop: 10 }]}>SS#</Text>
            <TextInput testID="edit-ss" value={editing?.document_id || ""} onChangeText={(t) => setEditing((e) => e && { ...e, document_id: t })} keyboardType="number-pad" style={s.input} placeholder="SS#" placeholderTextColor={colors.muted} />
            <Text style={[s.formLabel, { marginTop: 10 }]}>Rol</Text>
            <TextInput testID="edit-role" value={editing?.role || "Cosechador"} onChangeText={(t) => setEditing((e) => e && { ...e, role: t })} style={s.input} placeholderTextColor={colors.muted} />
            <TouchableOpacity testID="edit-save" onPress={saveEdit} style={[s.primaryBtn, { marginTop: 16, marginBottom: 0 }]}><Text style={s.primaryText}>Guardar cambios</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: { padding: 16 },
    primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: c.brandPrimary, height: 54, borderRadius: 16, marginBottom: 12 },
    primaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 17 },
    outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.brandPrimary, height: 54, borderRadius: 16, marginBottom: 16 },
    outlineText: { color: c.brandPrimary, fontWeight: "800", fontSize: 17 },
    formLabel: { fontSize: 11, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
    input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, height: 50, paddingHorizontal: 14, fontSize: 16, color: c.onSurface },
    row: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10 },
    flatList: { marginHorizontal: -16 },
    flatRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    name: { fontWeight: "800", color: c.onSurface, fontSize: 16 },
    sub: { fontSize: 12, color: c.onSurfaceTertiary, marginTop: 1 },
    code: { fontSize: 11, color: c.muted, marginTop: 2, fontVariant: ["tabular-nums"] },
    pendingCode: { fontSize: 11, color: c.warning, marginTop: 2, fontWeight: "700" },
    pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    pillText: { fontSize: 11, fontWeight: "800" },
    // 44px tap targets sit edge to edge (cancel the row gap); the last one's inner padding
    // hangs into the row padding so its glyph still ends 20px from the screen edge.
    iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -6 },
    iconBtnLast: { marginRight: -12 },
    modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 32 },
    qrCard: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 28, alignItems: "center", gap: 14 },
    qrName: { fontSize: 18, fontWeight: "800", color: c.onSurface },
    qrCode: { fontSize: 13, color: c.muted, fontVariant: ["tabular-nums"] },
    qrClose: { marginTop: 6, backgroundColor: c.brandPrimary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
    qrCloseText: { color: "#FFFFFF", fontWeight: "800" },
    modalBottom: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    sheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 },
    sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
    sheetTitle: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  });
