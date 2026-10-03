import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Lock, Mail, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import LogoHandCherry from "@/components/LogoHandCherry";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.ok) {
      toast.success("Bienvenido de vuelta");
      navigate("/");
    } else {
      setError(res.error);
      toast.error(res.error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5EE] p-4 relative overflow-hidden">
      {/* Decorative background */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#1E4620 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center shadow-lg mb-3 border-2 border-[#E2DDD0]">
            <LogoHandCherry size={56} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            AgriScan
          </h1>
          <p className="text-sm text-[#556047] mt-1 font-medium text-center">
            Control de cosechas en el campo
          </p>
        </div>

        <div className="field-card p-6 sm:p-7">
          <h2 className="text-xl font-bold text-[#1A2210] mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>
            Iniciar sesión
          </h2>
          <p className="text-sm text-[#556047] mb-5 font-medium">
            Ingresa tus credenciales para continuar
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-[#1A2210] mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#889078]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="field-input pl-11"
                  placeholder="tu@correo.com"
                  data-testid="login-email-input"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#1A2210] mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#889078]" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="field-input pl-11"
                  placeholder="••••••••"
                  data-testid="login-password-input"
                />
              </div>
            </div>

            {error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold" data-testid="login-error">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="field-btn-primary disabled:opacity-60"
              data-testid="login-submit-button"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Entrar al campo"
              )}
            </button>

            <div className="text-center text-sm text-[#556047] pt-2">
              ¿No tienes cuenta?{" "}
              <Link to="/register" className="text-[#1E4620] font-bold hover:underline" data-testid="link-register">
                Crear cuenta
              </Link>
            </div>
          </form>
        </div>

        <p className="text-center text-[11px] text-[#889078] mt-5 font-medium">
          © {new Date().getFullYear()} AgriScan — Hecho para el campo
        </p>
      </div>
    </div>
  );
}
