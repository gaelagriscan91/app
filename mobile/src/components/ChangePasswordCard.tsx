import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyRound, Eye, EyeOff } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { Card } from "@/src/components/ui";
import { useTheme, ThemeColors } from "@/src/theme";

export default function ChangePasswordCard() {
  const { colors } = useTheme();
  const s = styles(colors);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (next.length < 6) { toast.error("La nueva contraseña debe tener al menos 6 caracteres"); return; }
    if (next !== confirm) { toast.error("Las contraseñas no coinciden"); return; }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Contraseña actualizada");
      setCurrent(""); setNext(""); setConfirm(""); setOpen(false);
    } catch (e) { toast.error(apiErrorMessage(e, "No se pudo cambiar la contraseña")); }
    finally { setSaving(false); }
  };

  return (
    <Card style={{ marginBottom: 14 }}>
      {!open ? (
        <TouchableOpacity testID="change-password-open" onPress={() => setOpen(true)} style={s.openBtn}>
          <KeyRound size={18} color={colors.brandPrimary} /><Text style={s.openText}>Cambiar contraseña</Text>
        </TouchableOpacity>
      ) : (
        <View>
          <View style={s.head}>
            <Text style={s.title}>Cambiar contraseña</Text>
            <TouchableOpacity testID="change-password-toggle" onPress={() => setShow((v) => !v)}>
              {show ? <EyeOff size={20} color={colors.onSurfaceTertiary} /> : <Eye size={20} color={colors.onSurfaceTertiary} />}
            </TouchableOpacity>
          </View>
          <TextInput testID="change-password-current" value={current} onChangeText={setCurrent} secureTextEntry={!show} placeholder="Contraseña actual" placeholderTextColor={colors.muted} style={s.input} />
          <TextInput testID="change-password-new" value={next} onChangeText={setNext} secureTextEntry={!show} placeholder="Nueva contraseña (mín. 6)" placeholderTextColor={colors.muted} style={s.input} />
          <TextInput testID="change-password-confirm" value={confirm} onChangeText={setConfirm} secureTextEntry={!show} placeholder="Repite la nueva contraseña" placeholderTextColor={colors.muted} style={s.input} />
          <View style={s.row}>
            <TouchableOpacity onPress={() => setOpen(false)} style={[s.btn, { backgroundColor: colors.surfaceTertiary }]}><Text style={[s.btnText, { color: colors.onSurfaceTertiary }]}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity testID="change-password-save" onPress={submit} disabled={saving} style={[s.btn, { backgroundColor: colors.brandPrimary }]}><Text style={s.btnText}>{saving ? "..." : "Guardar"}</Text></TouchableOpacity>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    openBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: c.brandPrimary },
    openText: { color: c.brandPrimary, fontWeight: "800", fontSize: 15 },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    title: { fontSize: 15, fontWeight: "800", color: c.onSurface },
    input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, height: 48, paddingHorizontal: 14, fontSize: 15, color: c.onSurface, marginBottom: 10 },
    row: { flexDirection: "row", gap: 10, marginTop: 4 },
    btn: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    btnText: { color: "#FFFFFF", fontWeight: "800" },
  });
