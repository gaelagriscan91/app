import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Plus, X } from "lucide-react-native";
import { useTheme, ThemeColors } from "@/src/theme";

export type NamedItem = { id: string; name: string };

export default function NameAutocomplete({
  items, value, onPick, onCreate, placeholder, testID, label,
}: {
  items: NamedItem[];
  value: string;
  onPick: (item: NamedItem) => void;
  onCreate: (name: string) => void;
  placeholder?: string;
  testID?: string;
  label?: string;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);

  React.useEffect(() => { setText(value); }, [value]);

  const q = text.trim().toLowerCase();
  const matches = useMemo(() => (q ? items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 6) : []), [q, items]);
  const exact = items.some((i) => i.name.toLowerCase() === q);

  const pick = (i: NamedItem) => { onPick(i); setText(i.name); setOpen(false); };
  const create = () => { onCreate(text.trim()); setOpen(false); };

  return (
    <View style={s.wrap}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.inputRow}>
        <TextInput
          testID={testID}
          value={text}
          onChangeText={(t) => { setText(t); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { if (text.trim() && !items.some((i) => i.name.toLowerCase() === text.trim().toLowerCase())) { /* keep */ } }}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={s.input}
        />
        {text ? <TouchableOpacity onPress={() => { setText(""); onCreate(""); setOpen(false); }} style={s.clear}><X size={16} color={colors.muted} /></TouchableOpacity> : null}
      </View>
      {open && q && !exact ? (
        <View style={s.dropdown}>
          {matches.map((i) => (
            <TouchableOpacity key={i.id} onPress={() => pick(i)} style={s.option}><Text style={s.optionText}>{i.name}</Text></TouchableOpacity>
          ))}
          <TouchableOpacity onPress={create} style={[s.option, s.createOption]}>
            <Plus size={15} color={colors.brandPrimary} />
            <Text style={[s.optionText, { color: colors.brandPrimary, fontWeight: "800" }]}>Usar "{text.trim()}"</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { position: "relative", zIndex: 10, flex: 1 },
    label: { fontSize: 11, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12 },
    input: { flex: 1, height: 48, paddingHorizontal: 14, fontSize: 15, color: c.onSurface },
    clear: { padding: 10 },
    dropdown: { position: "absolute", top: 72, left: 0, right: 0, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: "hidden", zIndex: 30, elevation: 6, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    option: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.divider, flexDirection: "row", alignItems: "center", gap: 8 },
    createOption: { backgroundColor: c.brandTertiary },
    optionText: { fontSize: 15, color: c.onSurface },
  });
