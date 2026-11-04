import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, AlertCircle, Info } from "lucide-react-native";
import { useTheme } from "@/src/theme";

type ToastKind = "success" | "error" | "info";
type ToastMsg = { id: number; kind: ToastKind; text: string };

let externalPush: ((kind: ToastKind, text: string) => void) | null = null;
export const toast = {
  success: (t: string) => externalPush?.("success", t),
  error: (t: string) => externalPush?.("error", t),
  info: (t: string) => externalPush?.("info", t),
};

const Ctx = createContext<null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { colors } = useTheme();

  const push = useCallback((kind: ToastKind, text: string) => {
    if (!text) return;
    setMsg({ id: Date.now(), kind, text });
    if (timer.current) clearTimeout(timer.current);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMsg(null));
    }, 2600);
  }, [anim]);

  useEffect(() => {
    externalPush = push;
    return () => { externalPush = null; };
  }, [push]);

  const bg = msg?.kind === "error" ? colors.error : msg?.kind === "success" ? colors.success : colors.surfaceInverse;
  const Icon = msg?.kind === "error" ? AlertCircle : msg?.kind === "success" ? CheckCircle2 : Info;

  return (
    <Ctx.Provider value={null}>
      {children}
      {msg && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            { top: insets.top + 10, backgroundColor: bg, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] },
          ]}
        >
          <Icon size={18} color="#FFFFFF" />
          <Text style={styles.text} testID="toast-message">{msg.text}</Text>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { color: "#FFFFFF", fontWeight: "700", flex: 1, fontSize: 14 },
});
