import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { User, Mail, Lock, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import LogoHandCherry from "@/components/LogoHandCherry";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setError("");
    setLoading(true);
    const res = await register(name, email, password);
    setLoading(false);
    if (res.ok) {
      toast.success("Cuenta creada");
      navigate("/");
    } else {
      setError(res.error);
      toast.error(res.error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5EE] p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-5">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-lg mb-3 border-2 border-[#E2DDD0]">
            <LogoHandCherry size={46} />
          </div>
          <h1 className="text-2xl font-extrabold text-[#1A2210]" style={{ fontFamily: "Outfit, sans-serif" }}>
            Crear cuenta
          </h1>
        </div>

        <div className="field-card p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Nombre</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#889078]" />
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  required className="field-input pl-11" placeholder="Tu nombre"
                  data-testid="register-name-input"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Correo electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#889078]" />
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  required className="field-input pl-11" placeholder="tu@correo.com"
                  data-testid="register-email-input"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-[#1A2210] mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#889078]" />
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  required className="field-input pl-11" placeholder="Mínimo 6 caracteres"
                  data-testid="register-password-input"
                />
              </div>
            </div>

            {error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-semibold">
                {error}
              </div>
            ) : null}

            <button type="submit" disabled={loading} className="field-btn-primary disabled:opacity-60" data-testid="register-submit-button">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Crear cuenta"}
            </button>

            <div className="text-center text-sm text-[#556047] pt-2">
              ¿Ya tienes cuenta?{" "}
              <Link to="/login" className="text-[#1E4620] font-bold hover:underline" data-testid="link-login">
                Iniciar sesión
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
