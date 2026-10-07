import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import LogoHandCherry from "@/components/LogoHandCherry";

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const res = await forgotPassword(email);
    setLoading(false);
    if (res.ok) {
      setMessage(res.message || "Si el correo está registrado, te enviaremos un enlace.");
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5EE] p-4 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#1D4ED8 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <LogoHandCherry size={110} className="mb-2 drop-shadow-md" />
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1A2210] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            AgriScan
          </h1>
        </div>

        <div className="field-card p-6 sm:p-7">
          <h2 className="text-xl font-bold text-[#1A2210] mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>
            Recuperar contraseña
          </h2>
          <p className="text-sm text-[#556047] mb-5 font-medium">
            Ingresa el correo de tu cuenta y te enviaremos un enlace para restablecer tu contraseña.
          </p>

          {message ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 font-semibold flex items-start gap-2 mb-4" data-testid="forgot-success">
              <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
              <div>{message}</div>
            </div>
          ) : null}

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
                  data-testid="forgot-email-input"
                />
              </div>
            </div>

            {error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold" data-testid="forgot-error">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="field-btn-primary disabled:opacity-60"
              data-testid="forgot-submit-button"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Enviar enlace"}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="text-sm text-[#1D4ED8] font-bold hover:underline inline-flex items-center gap-1"
                data-testid="forgot-back-link"
              >
                <ArrowLeft className="w-4 h-4" /> Volver a iniciar sesión
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
