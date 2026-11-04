import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { useAuth } from "@/src/auth/AuthContext";
import { toast } from "@/src/components/Toast";
import Logo from "@/src/components/Logo";
import { useTheme } from "@/src/theme";

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async () => {
    if (!name.trim()) { setError("Escribe tu nombre"); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }
    setError("");
    setLoading(true);
    const res = await register(name, email, password);
    setLoading(false);
    if (res.ok) {
      toast.success("¡Cuenta creada! Tienes 3 días gratis.");
      router.replace("/(tabs)/registrar");
    } else {
      setError(res.error || "No se pudo crear la cuenta");
      toast.error(res.error || "No se pudo crear la cuenta");
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.flex, { backgroundColor: colors.surfaceInverse }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Logo size={80} />
          <Text style={styles.brand}>AgriScan</Text>
          <Text style={styles.tagline}>Crear cuenta de mayordomo</Text>
        </View>

        <TextInput testID="register-name-input" value={name} onChangeText={setName} placeholder="Nombre completo" placeholderTextColor="rgba(255,255,255,0.6)" style={styles.input} />
        <TextInput testID="register-email-input" value={email} onChangeText={setEmail} placeholder="Correo electrónico" placeholderTextColor="rgba(255,255,255,0.6)" autoCapitalize="none" keyboardType="email-address" style={styles.input} />
        <View style={styles.pwRow}>
          <TextInput testID="register-password-input" value={password} onChangeText={setPassword} placeholder="Contraseña (mín. 6)" placeholderTextColor="rgba(255,255,255,0.6)" secureTextEntry={!show} autoCapitalize="none" style={[styles.input, styles.flex]} />
          <TouchableOpacity testID="register-toggle-password" onPress={() => setShow((v) => !v)} style={styles.eye}>
            {show ? <EyeOff size={20} color="rgba(255,255,255,0.85)" /> : <Eye size={20} color="rgba(255,255,255,0.85)" />}
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBox}><Text style={styles.errorText} testID="register-error">{error}</Text></View>
        ) : null}

        <TouchableOpacity testID="register-submit-button" onPress={onSubmit} disabled={loading} activeOpacity={0.85} style={[styles.submit, { backgroundColor: colors.brandSecondary, opacity: loading ? 0.7 : 1 }]}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Crear cuenta</Text>}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Ya tienes cuenta?</Text>
          <TouchableOpacity testID="register-login-link" onPress={() => router.replace("/(auth)/login")}>
            <Text style={[styles.link, { color: colors.brandSecondary }]}>Entrar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 32, paddingVertical: 48 },
  logoWrap: { alignItems: "center", marginBottom: 30, gap: 6 },
  brand: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", marginTop: 8 },
  tagline: { color: "rgba(255,255,255,0.7)", fontSize: 14 },
  input: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.8)", color: "#FFFFFF", fontSize: 17, paddingVertical: 12, marginBottom: 22 },
  pwRow: { flexDirection: "row", alignItems: "center" },
  eye: { padding: 8, marginBottom: 14 },
  errorBox: { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(248,113,113,0.5)", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { color: "#FECACA", fontWeight: "600", fontSize: 13 },
  submit: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 8, alignSelf: "center", width: "72%" },
  submitText: { color: "#FFFFFF", fontSize: 19, fontWeight: "800" },
  footer: { alignItems: "center", marginTop: 28, gap: 4 },
  footerText: { color: "#FFFFFF", fontSize: 16 },
  link: { fontSize: 17, fontWeight: "800" },
});
