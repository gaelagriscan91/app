import React, { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { X, Camera as CameraIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";

type Props = {
  onScan: (code: string) => void;
  onClose: () => void;
  title?: string;
};

export default function QRScanner({ onScan, onClose, title = "Escanea el QR del empleado" }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [asked, setAsked] = useState(false);
  const lockRef = useRef(false);
  const lastRef = useRef({ code: "", at: 0 });
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Auto-request once when undetermined (contextual: scanner opened on user intent)
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && !asked) {
      setAsked(true);
      requestPermission();
    }
  }, [permission, asked, requestPermission]);

  const handleScanned = ({ data }: { data: string }) => {
    if (lockRef.current || !data) return;
    const now = Date.now();
    if (data === lastRef.current.code && now - lastRef.current.at < 1500) return;
    lastRef.current = { code: data, at: now };
    lockRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onScan(data);
    setTimeout(() => { lockRef.current = false; }, 1200);
  };

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerTitle}>
        <CameraIcon size={16} color="#FFFFFF" />
        <Text style={styles.headerText}>{title}</Text>
      </View>
      <TouchableOpacity testID="qr-close-button" onPress={onClose} style={styles.closeBtn}>
        <X size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  if (!permission) {
    return <View style={styles.black}>{Header}</View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.black} testID="qr-permission-screen">
        {Header}
        <View style={styles.center}>
          <CameraIcon size={56} color={colors.brandSecondary} />
          <Text style={styles.permTitle}>Permiso de cámara</Text>
          <Text style={styles.permBody}>
            AgriScan necesita la cámara para leer el código QR de cada empleado.
          </Text>
          {permission.canAskAgain ? (
            <TouchableOpacity testID="qr-grant-button" onPress={() => requestPermission()} style={[styles.permBtn, { backgroundColor: colors.brandSecondary }]}>
              <Text style={styles.permBtnText}>Permitir cámara</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity testID="qr-settings-button" onPress={() => Linking.openSettings()} style={[styles.permBtn, { backgroundColor: colors.brandPrimary }]}>
              <Text style={styles.permBtnText}>Abrir Ajustes</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.black} testID="qr-scanner">
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "ean13", "code39"] }}
        onBarcodeScanned={handleScanned}
      />
      {Header}
      <View style={styles.frameWrap} pointerEvents="none">
        <View style={[styles.frame, { borderColor: colors.brandSecondary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000", zIndex: 100 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  headerTitle: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  headerText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 14 },
  permTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  permBody: { color: "#D1D5DB", textAlign: "center", fontSize: 14, lineHeight: 20 },
  permBtn: { marginTop: 10, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  frameWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: { width: 240, height: 240, borderWidth: 4, borderRadius: 24 },
});
