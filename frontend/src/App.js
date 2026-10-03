import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import RegistrarCosecha from "@/pages/RegistrarCosecha";
import ListaDia from "@/pages/ListaDia";
import Reportes from "@/pages/Reportes";
import Modulos from "@/pages/Modulos";
import Asistencia from "@/pages/Asistencia";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5EE]">
        <div className="text-[#1E4620] font-semibold">Cargando…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/registrar" element={<RegistrarCosecha />} />
        <Route path="/asistencia" element={<Asistencia />} />
        <Route path="/dia" element={<ListaDia />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/modulos" element={<Modulos />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            style: { fontFamily: "Manrope, sans-serif", fontWeight: 600 },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
