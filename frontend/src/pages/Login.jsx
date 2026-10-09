import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import LogoHandCherry from "@/components/LogoHandCherry";

const LAST_EMAIL_KEY = "agriscan.lastEmail";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.ok) {
      try { localStorage.setItem(LAST_EMAIL_KEY, email.trim()); } catch (_) {}
      toast.success("Bienvenido de vuelta");
      navigate("/");
    } else {
      setError(res.error);
      toast.error(res.error);
    }
  };

  const lineInput = "w-full bg-transparent border-0 border-b border-white/80 text-white text-lg placeholder:text-white/85 py-2.5 focus:outline-none focus:border-[#8DC63F] transition-colors";

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#1F2E52] flex flex-col" data-testid="login-page">
      {/* White diagonal bottom */}
      <div
        className="absolute inset-x-0 bottom-0 h-[30%] bg-white pointer-events-none"
        style={{ clipPath: "polygon(0 0, 100% 75%, 100% 100%, 0 100%)" }}
      />

      <div className="relative flex-1 flex flex-col items-center px-10 pt-16 sm:pt-20 w-full max-w-md mx-auto">
        <LogoHandCherry size={130} light className="mb-2" />
        <h1 className="text-2xl font-bold text-white tracking-tight mb-8" style={{ fontFamily: "Outfit, sans-serif" }} data-testid="login-brand-name">
          AgriScan
        </h1>

        <form onSubmit={onSubmit} className="w-full space-y-6">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={lineInput}
            placeholder="Correo electrónico"
            data-testid="login-email-input"
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus={!!email}
              autoComplete="current-password"
              className={`${lineInput} pr-36`}
              placeholder="Contraseña"
              data-testid="login-password-input"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-24 top-1/2 -translate-y-1/2 p-1.5 text-white/85 hover:text-white transition-colors"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              data-testid="login-toggle-password"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={() => navigate("/forgot-password")}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-sm font-bold text-[#8DC63F] hover:text-[#A6D95C] transition-colors"
              data-testid="login-forgot-link"
            >
              ¿Olvidaste?
            </button>
          </div>

          {error ? (
            <div className="bg-red-500/15 border border-red-400/50 rounded-xl p-3 text-sm text-red-100 font-semibold" data-testid="login-error">
              {error}
            </div>
          ) : null}

          <div className="flex justify-center pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-[70%] h-14 rounded-xl bg-[#8DC63F] hover:bg-[#7DB52F] active:scale-[0.98] text-white text-xl font-bold flex items-center justify-center transition-[background-color,transform] disabled:opacity-60"
              data-testid="login-submit-button"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Entrar"}
            </button>
          </div>

          <div className="text-center pt-2">
            <p className="text-white text-lg">¿No tienes cuenta?</p>
            <p className="text-[#8DC63F] text-base font-bold mt-1" data-testid="login-no-account-hint">Pide a tu administrador</p>
          </div>
        </form>
      </div>

      <div className="relative px-8 pb-8 pt-4 flex items-end justify-between max-w-md w-full mx-auto">
        <div className="flex flex-col items-center" data-testid="login-footer-logo">
          <LogoHandCherry size={70} />
          <span className="text-lg font-bold text-[#1F2E52] -mt-1" style={{ fontFamily: "Outfit, sans-serif" }}>AgriScan</span>
        </div>
        <p className="text-[11px] text-[#889078] font-medium">© {new Date().getFullYear()} AgriScan</p>
      </div>
    </div>
  );
}
