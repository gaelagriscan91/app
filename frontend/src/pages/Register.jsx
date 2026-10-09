import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import LogoHandCherry from "@/components/LogoHandCherry";

const lineInput = "w-full bg-transparent border-0 border-b border-white/80 text-white text-lg placeholder:text-white/85 py-2.5 focus:outline-none focus:border-[#8DC63F] transition-colors";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }
    setError("");
    setLoading(true);
    const res = await register(name, email, password);
    setLoading(false);
    if (res.ok) {
      try { localStorage.setItem("agriscan.lastEmail", email.trim()); } catch (_) {}
      toast.success("Cuenta creada. Espera a que te la desbloqueen.");
    } else {
      setError(res.error);
      toast.error(res.error);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#1F2E52] flex flex-col" data-testid="register-page">
      <div className="absolute inset-x-0 bottom-0 h-[24%] bg-white pointer-events-none" style={{ clipPath: "polygon(0 0, 100% 75%, 100% 100%, 0 100%)" }} />
      <div className="relative flex-1 flex flex-col items-center px-10 pt-12 w-full max-w-md mx-auto">
        <LogoHandCherry size={100} light className="mb-1" />
        <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>AgriScan</h1>
        <p className="text-white/80 text-sm mb-7">Crear cuenta de mayordomo</p>

        <form onSubmit={onSubmit} className="w-full space-y-6">
          <input value={name} onChange={(e) => setName(e.target.value)} required className={lineInput} placeholder="Nombre completo" data-testid="register-name-input" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={lineInput} placeholder="Correo electrónico" data-testid="register-email-input" />
          <div className="relative">
            <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" className={`${lineInput} pr-10`} placeholder="Contraseña (mín. 6)" data-testid="register-password-input" />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-white/85 hover:text-white" aria-label="Mostrar contraseña" data-testid="register-toggle-password">
              {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {error ? (
            <div className="bg-red-500/15 border border-red-400/50 rounded-xl p-3 text-sm text-red-100 font-semibold" data-testid="register-error">{error}</div>
          ) : null}

          <div className="flex justify-center pt-2">
            <button type="submit" disabled={loading} className="w-[70%] h-14 rounded-xl bg-[#8DC63F] hover:bg-[#7DB52F] active:scale-[0.98] text-white text-xl font-bold flex items-center justify-center transition-[background-color,transform] disabled:opacity-60" data-testid="register-submit-button">
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Crear cuenta"}
            </button>
          </div>

          <div className="text-center">
            <p className="text-white text-base">¿Ya tienes cuenta?</p>
            <button type="button" onClick={() => navigate("/login")} className="text-[#8DC63F] text-lg font-bold mt-1 hover:text-[#A6D95C] transition-colors" data-testid="link-login">Entrar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
