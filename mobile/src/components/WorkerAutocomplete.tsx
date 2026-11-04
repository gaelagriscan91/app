import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { UserPlus, X } from "lucide-react-native";
import api, { apiErrorMessage } from "@/src/api/client";
import { toast } from "@/src/components/Toast";
import { useTheme, ThemeColors } from "@/src/theme";

export type Worker = { id: string; name: string; active?: boolean; qr_code?: string };

export default function WorkerAutocomplete({
  workers, onPick, onCreated, placeholder = "Empleado", testID,
}: {
  workers: Worker[];
  onPick: (w: Worker) => void;
  onCreated?: (w: Worker) => void;
  placeholder?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  const q = text.trim().toLowerCase();
  const matches = useMemo(() => (q ? workers.filter((w) => w.name.toLowerCase().includes(q)).slice(0, 6) : []), [q, workers]);
  const exact = workers.some((w) => w.name.toLowerCase() === q);

  const pick = (w: Worker) => { onPick(w); setText(""); setOpen(false); };
  const createNew = async () => {
    try {
      const { data } = await api.post("/workers", { name: text.trim() });
      onCreated?.(data);
      pick({ id: data.id, name: data.name });
      toast.success(`Empleado agregado: ${data.name}`);
    } catch (e) {
      toast.error(apiErrorMessage(e, "No se pudo agregar"));
    }
  };

  return (
    <View style={s.wrap}>
      <View style={s.inputRow}>
        <TextInput
          testID={testID}
          value={text}
          onChangeText={(t) => { setText(t); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={s.input}
        />
        {text ? (
          <TouchableOpacity onPress={() => { setText(""); setOpen(false); }} style={s.clear}>
            <X size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {open && q ? (
        <View style={s.dropdown} testID="worker-suggestions">
          {matches.map((w) => (
            <TouchableOpacity key={w.id} onPress={() => pick(w)} style={s.option} testID={`worker-option-${w.id}`}>
              <Text style={s.optionText}>{w.name}</Text>
            </TouchableOpacity>
          ))}
          {!exact ? (
            <TouchableOpacity onPress={createNew} style={[s.option, s.createOption]} testID="worker-create">
              <UserPlus size={16} color={colors.brandPrimary} />
              <Text style={[s.optionText, { color: colors.brandPrimary, fontWeight: "800" }]}>Agregar "{text.trim()}"</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { position: "relative", zIndex: 20 },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12 },
    input: { flex: 1, height: 50, paddingHorizontal: 14, fontSize: 16, color: c.onSurface },
    clear: { padding: 10 },
    dropdown: { position: "absolute", top: 54, left: 0, right: 0, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: "hidden", zIndex: 30, elevation: 6, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    option: { paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.divider, flexDirection: "row", alignItems: "center", gap: 8 },
    createOption: { backgroundColor: c.brandTertiary },
    optionText: { fontSize: 15, color: c.onSurface },
  });
