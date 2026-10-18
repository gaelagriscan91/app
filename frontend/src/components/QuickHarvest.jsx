import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, Printer, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiErrorDetail, formatCurrency, todayISO, fetchCheckinSession } from "@/lib/api";
import QrScanner from "@/components/QrScanner";

const FRACTIONS = [["1/4", 0.25], ["1/2", 0.5], ["3/4", 0.75]];
const TIPO = { pieza: "Pieza", libra: "Libra", horas: "Horas" };

function Row({ label, children, testid }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-[#ECECEC] bg-white" data-testid={testid}>
      <span className="text-[17px] text-[#4B5563]">{label}</span>
      {children}
    </div>
  );
}

function Records({ rows, loading, onBack }) {
  return (
    <div className="flex-1 overflow-y-auto bg-[#E9E9E9]" data-testid="quick-records">
      <button onClick={onBack} className="flex items-center gap-2 px-4 py-3 text-[#1D4ED8] font-bold" data-testid="quick-records-back">
        <ArrowLeft className="w-5 h-5" /> Escanear
      </button>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#1D4ED8]" /></div>
      ) : rows.length === 0 ? (
        <p className="text-center text-[#6B7280] py-10 font-semibold">Sin registros hoy</p>
      ) : (
        rows.map((h) => (
          <div key={h.id} className="flex items-center justify-between bg-white px-4 py-3 border-b border-[#ECECEC]" data-testid={`quick-record-${h.id}`}>
            <div className="min-w-0">
              <div className="font-semibold text-[#111827] truncate">{h.worker_name}</div>
              <div className="text-xs text-[#6B7280]">{h.units} {h.unit_label || "pza"} · {formatCurrency(h.price_per_unit)}</div>
            </div>
            <div className="font-bold text-[#111827] font-mono-stat">{formatCurrency(h.payment)}</div>
          </div>
        ))
      )}
    </div>
  );
}

export default function QuickHarvest() {
  const navigate = useNavigate();
  const today = todayISO();
  const [session, setSession] = useState({});
  const [scanning, setScanning] = useState(false);
  const [worker, setWorker] = useState(null);
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("scan");
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const scanLock = useRef(false);

  const mode = session.unitMode || "pieza";
  const price = Number(mode === "horas" ? session.pricePerHour : session.pricePerUnit) || 0;

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    try {
      const { data } = await api.get("/harvests", { params: { date_from: today, date_to: today } });
      setRows(data || []);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudieron cargar los registros");
    } finally {
      setLoadingRows(false);
    }
  }, [today]);

  useEffect(() => { fetchCheckinSession(today).then((s) => setSession(s || {})); }, [today]);
  useEffect(() => { if (view === "records") loadRows(); }, [view, loadRows]);

  const openScanner = () => {
    if (!session.parcelId || !session.productId || price <= 0) {
      toast.error("Completa primero el Check in (Rancho, Trabajo y Precio)");
      navigate("/asistencia");
      return;
    }
    scanLock.current = false;
    setScanning(true);
  };

  const onScan = async (code) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setScanning(false);
    try {
      const { data } = await api.post("/workers/resolve", { code });
      setWorker({ id: data.id, name: data.name });
      setQty("1");
    } catch (_) {
      toast.error("QR no registrado");
    }
  };

  const save = async () => {
    const units = Number(qty);
    if (!worker || !(units > 0)) { toast.error("Escanea un empleado y pon la cantidad"); return; }
    setSaving(true);
    try {
      await api.post("/harvests", {
        worker_id: worker.id, parcel_id: session.parcelId, product_id: session.productId,
        kilos: 0, units, price_per_kg: 0, price_per_unit: price, price_mode: "piece",
        date: today, photo_path: "", notes: "Cosecha escaneada",
        block: session.block || "", variety: session.variedad || "", mayordomo: session.mayordomo || "",
      });
      toast.success(`Guardado: ${worker.name} · ${units}`);
      setWorker(null);
      setQty("");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  if (scanning) return <QrScanner fullscreen active onScan={onScan} onClose={() => setScanning(false)} title="Escanea el QR del empleado" />;

  return (
    <div className="flex flex-col min-h-[calc(100dvh-170px)] bg-[#E9E9E9] -mx-4 -my-4 sm:mx-0 sm:my-0 sm:rounded-2xl overflow-hidden" data-testid="quick-harvest">
      {view === "records" ? (
        <Records rows={rows} loading={loadingRows} onBack={() => setView("scan")} />
      ) : (
        <div className="relative flex-1">
          <Row label="Empleado" testid="quick-employee">
            <span className={`text-[19px] truncate ${worker ? "text-[#111827]" : "text-[#C4C4C4]"}`} data-testid="quick-employee-name">{worker?.name || "Empleado"}</span>
          </Row>
          <Row label="Cantidad" testid="quick-qty-row">
            <div className="flex items-center gap-1.5">
              {FRACTIONS.map(([l, v]) => (
                <button key={l} onClick={() => setQty(String(v))} disabled={!worker} className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors ${Number(qty) === v ? "bg-[#9BC53D] text-white" : "bg-[#E5E7EB] text-[#6B7280]"} disabled:opacity-50`} data-testid={`quick-frac-${l.replace("/", "-")}`}>{l}</button>
              ))}
            </div>
            <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="Cantidad" disabled={!worker} className="w-20 text-right text-[19px] bg-transparent outline-none placeholder:text-[#C4C4C4] disabled:bg-transparent" data-testid="quick-qty-input" />
          </Row>
          <div className="h-6" />
          <Row label="Precio" testid="quick-price"><span className="text-[17px] text-[#111827]">{formatCurrency(price)}</span></Row>
          <div className="h-2" />
          <Row label="Tipo" testid="quick-type"><span className="text-[17px] text-[#111827]">{TIPO[mode] || "Pieza"}</span></Row>

          <button
            onClick={worker ? save : openScanner}
            disabled={saving}
            className="absolute right-5 bottom-5 w-[84px] h-[84px] rounded-full bg-[#9BC53D] hover:bg-[#8AB42F] text-white shadow-[0_6px_16px_rgba(0,0,0,0.25)] flex items-center justify-center transition-[background-color,transform] active:scale-95 disabled:opacity-70"
            data-testid={worker ? "quick-save-button" : "quick-scan-button"}
          >
            {saving ? <Loader2 className="w-8 h-8 animate-spin" /> : worker ? <span className="text-xl font-extrabold">SAVE</span> : <QrCode className="w-11 h-11" />}
          </button>
        </div>
      )}

      <button onClick={() => setView(view === "records" ? "scan" : "records")} className={`shrink-0 bg-white border-t border-[#E5E7EB] py-3 flex flex-col items-center ${view === "records" ? "text-[#1D4ED8]" : "text-[#6B7280]"}`} data-testid="quick-records-tab">
        <Printer className="w-8 h-8" strokeWidth={1.4} />
        <span className="text-sm">Records</span>
      </button>
    </div>
  );
}
