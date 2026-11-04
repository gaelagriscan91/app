import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api, { apiErrorMessage } from "@/src/api/client";
import { enqueue, newTempId } from "@/src/offline/queue";
import { useOffline } from "@/src/offline/OfflineContext";
import { toast } from "@/src/components/Toast";

const isNetworkError = (e: any) => !e?.response || e?.code === "ERR_NETWORK" || e?.message === "Network Error";

export function useOfflineActions() {
  const qc = useQueryClient();
  const { online } = useOffline();

  const workerName = useCallback((id: string) => {
    const list = (qc.getQueryData<any[]>(["workers"]) || []);
    return list.find((w) => w.id === id)?.name || "Empleado";
  }, [qc]);

  /** Create a worker. Offline → temp id + queued; the harvest/attendance that references it is remapped on sync. */
  const createWorker = useCallback(async (name: string): Promise<{ id: string; name: string; pending?: boolean }> => {
    const addToCache = (w: any) => qc.setQueryData<any[]>(["workers"], (prev) => [...(prev || []), w]);
    if (online) {
      try {
        const { data } = await api.post("/workers", { name });
        addToCache(data);
        return { id: data.id, name: data.name };
      } catch (e) {
        if (!isNetworkError(e)) { toast.error(apiErrorMessage(e, "No se pudo agregar")); throw e; }
      }
    }
    const tempId = newTempId();
    enqueue({ type: "worker", payload: { name }, tempWorkerId: tempId });
    addToCache({ id: tempId, name, active: true, _pending: true });
    toast.info(`Guardado sin conexión: ${name}`);
    return { id: tempId, name, pending: true };
  }, [online, qc]);

  /** Save a harvest. Offline → queued + optimistic record in today's list. */
  const saveHarvest = useCallback(async (payload: any, meta: { workerName: string; today: string }) => {
    if (online) {
      try { await api.post("/harvests", payload); qc.invalidateQueries({ queryKey: ["harvests-today", meta.today] }); return { pending: false }; }
      catch (e) { if (!isNetworkError(e)) throw e; }
    }
    enqueue({ type: "harvest", payload });
    const units = Number(payload.units || 0);
    const synthetic = {
      id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      worker_id: payload.worker_id, worker_name: meta.workerName,
      units, price_per_unit: Number(payload.price_per_unit || 0),
      payment: Math.round(units * Number(payload.price_per_unit || 0) * 100) / 100,
      unit_type: payload.unit_type, price_mode: payload.price_mode, date: payload.date,
      created_at: new Date().toISOString(), grower: payload.grower, mayordomo: payload.mayordomo, _pending: true,
    };
    qc.setQueryData<any[]>(["harvests-today", meta.today], (prev) => [synthetic, ...(prev || [])]);
    return { pending: true };
  }, [online, qc]);

  /** Attendance check-in/out. Offline → queued + optimistic toggle when the code is a known worker id. */
  const scanAttendance = useCallback(async (code: string, date: string) => {
    if (online) {
      try {
        const { data } = await api.post("/attendance/scan", { code, date });
        toast.success(`${data.action === "check_out" ? "Salida" : "Entrada"}: ${data.worker_name}`);
        qc.invalidateQueries({ queryKey: ["attendance", date] });
        return { pending: false };
      } catch (e) { if (!isNetworkError(e)) { toast.error(apiErrorMessage(e, "No se pudo registrar")); return { pending: false }; } }
    }
    enqueue({ type: "attendance", payload: { code, date } });
    const now = new Date().toISOString();
    qc.setQueryData<any>(["attendance", date], (prev) => {
      const rows = [...((prev && prev.rows) || [])];
      const idx = rows.findIndex((r) => r.worker_id === code);
      if (idx === -1) {
        rows.push({ id: `tmp_${Date.now()}`, worker_id: code, worker_name: workerName(code), check_in: now, check_out: null, _pending: true });
        toast.info(`Entrada sin conexión: ${workerName(code)}`);
      } else if (!rows[idx].check_out) {
        rows[idx] = { ...rows[idx], check_out: now, _pending: true };
        toast.info(`Salida sin conexión: ${rows[idx].worker_name}`);
      } else {
        toast.info("Registrado sin conexión");
      }
      return { ...(prev || {}), rows };
    });
    return { pending: true };
  }, [online, qc, workerName]);

  return { createWorker, saveHarvest, scanAttendance };
}
