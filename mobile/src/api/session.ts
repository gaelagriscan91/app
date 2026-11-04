import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/src/api/client";

export type Session = {
  parcelId?: string;
  productId?: string;
  ranchoName?: string;
  trabajoName?: string;
  block?: string;
  variedad?: string;
  unitMode?: "pieza" | "libra" | "horas";
  pricePerUnit?: number | string;
  pricePerHour?: number | string;
  mayordomo?: string;
  grower?: string;
};

async function fetchSession(): Promise<Session> {
  const { data } = await api.get("/checkin-session");
  return data || {};
}

export function useSession() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["checkin-session"], queryFn: fetchSession, staleTime: 10_000 });

  const save = useCallback(
    async (patch: Partial<Session>) => {
      const current = qc.getQueryData<Session>(["checkin-session"]) || {};
      const next = { ...current, ...patch };
      qc.setQueryData(["checkin-session"], next);
      await api.put("/checkin-session", next).catch(() => {});
      return next;
    },
    [qc],
  );

  return { session: query.data || {}, loading: query.isLoading, save, refetch: query.refetch };
}
