import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import LogoHandCherry from "@/components/LogoHandCherry";

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError("Enlace inválido o faltan datos.");
  }, [token]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    const res = await resetPassword(token, password);
    setLoading(false);
    if (res.ok) {
      setDone(true);
      toast.success("Contraseña actualizada. Inicia sesión.");
      setTimeout(() => navigate("/login"), 1500);
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
            Nueva contraseña
          </h2>
          <p className="text-sm text-[#556047] mb-5 font-medium">
            Ingresa tu nueva contraseña. Después inicia sesión con la nueva clave.
          </p>

          {done ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 font-semibold flex items-start gap-2 mb-4" data-testid="reset-success">
              <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
              <div>Contraseña actualizada. Redirigiendo…</div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#1A2210] mb-1.5">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#889078]" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="field-input pl-11"
                    placeholder="Mínimo 6 caracteres"
                    data-testid="reset-password-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#1A2210] mb-1.5">
                  Repetir contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#889078]" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="field-input pl-11"
                    placeholder="Repetir contraseña"
                    data-testid="reset-confirm-input"
                  />
                </div>
              </div>

              {error ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold" data-testid="reset-error">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading || !token}
                className="field-btn-primary disabled:opacity-60"
                data-testid="reset-submit-button"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Guardar contraseña"}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="text-sm text-[#1D4ED8] font-bold hover:underline inline-flex items-center gap-1"
                  data-testid="reset-back-link"
                >
                  <ArrowLeft className="w-4 h-4" /> Volver a iniciar sesión
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
