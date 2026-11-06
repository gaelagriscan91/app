import React from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View, ViewStyle } from "react-native";
import { useTheme, ThemeColors } from "@/src/theme";

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  const { colors } = useTheme();
  return <View testID={testID} style={[styles(colors).card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text style={styles(colors).sectionTitle}>{children}</Text>;
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={styles(colors).screenTitle}>{title}</Text>
      {subtitle ? <Text style={styles(colors).screenSub}>{subtitle}</Text> : null}
    </View>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={{ flex: 1 }}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[s.input, style]}
        {...props}
      />
    </View>
  );
}

export function PrimaryButton({
  title, onPress, loading, disabled, variant = "primary", testID, icon,
}: {
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean;
  variant?: "primary" | "accent" | "secondary" | "danger"; testID?: string; icon?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const bg = variant === "accent" ? colors.brandSecondary
    : variant === "danger" ? colors.error
    : variant === "secondary" ? colors.surfaceSecondary
    : colors.brandPrimary;
  const fg = variant === "secondary" ? colors.onSurfaceTertiary : "#FFFFFF";
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[styles(colors).btn, { backgroundColor: bg, opacity: disabled || loading ? 0.55 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={styles(colors).btnInner}>
          {icon}
          <Text style={[styles(colors).btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={styles(colors).loading}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={styles(colors).empty}>{text}</Text>;
}

/** Flat, full-width list used on every menu screen: white rows, 1px grey line between rows. */
export function FlatGroup({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[styles(colors).flatGroup, style]}>{children}</View>;
}

export function FlatRow({ children, style, onPress, testID }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void; testID?: string }) {
  const { colors } = useTheme();
  const st = [styles(colors).flatRow, style];
  return onPress
    ? <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.7} style={st}>{children}</TouchableOpacity>
    : <View testID={testID} style={st}>{children}</View>;
}

/** Screen header: large regular title (+ optional subtitle, right slot) with a 2px line under it. */
export function HeaderRow({ title, subtitle, right, testID }: { title: string; subtitle?: string; right?: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View testID={testID} style={s.headerRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>{title}</Text>
        {subtitle ? <Text style={s.headerSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 16 },
    sectionTitle: { fontSize: 16, fontWeight: "800", color: c.onSurface, marginBottom: 10 },
    screenTitle: { fontSize: 26, fontWeight: "800", color: c.onSurface, letterSpacing: -0.4 },
    screenSub: { fontSize: 13, fontWeight: "600", color: c.onSurfaceTertiary, marginTop: 2 },
    fieldLabel: { fontSize: 11, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 },
    input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, height: 50, fontSize: 16, color: c.onSurface },
    btn: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    btnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
    btnText: { fontSize: 16, fontWeight: "800" },
    loading: { paddingVertical: 48, alignItems: "center", justifyContent: "center" },
    flatGroup: { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.hairline },
    flatRow: { backgroundColor: c.surface, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.hairline },
    headerRow: { flexDirection: "row", alignItems: "center", backgroundColor: c.surface, paddingLeft: 20, paddingRight: 12, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: c.hairlineStrong },
    headerTitle: { fontSize: 22, fontWeight: "500", color: c.onSurface },
    headerSub: { fontSize: 13, fontWeight: "600", color: c.onSurfaceTertiary, marginTop: 2 },
    empty: { textAlign: "center", color: c.onSurfaceTertiary, fontWeight: "600", paddingVertical: 32 },
  });
