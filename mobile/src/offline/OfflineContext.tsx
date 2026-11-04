import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import { loadQueue, pendingCount, subscribe, syncQueue } from "@/src/offline/queue";
import { storage } from "@/src/utils/storage";
import { toast } from "@/src/components/Toast";

type OfflineValue = {
  online: boolean;
  pending: number;
  syncing: boolean;
  sync: (opts?: { silent?: boolean }) => Promise<void>;
};

const Ctx = createContext<OfflineValue | null>(null);

// Query keys whose data we keep on disk so reads work with no signal.
const CACHE_KEY = "rq_cache_v1";
const WHITELIST = ["workers", "checkin-session", "attendance", "harvests-today"];

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const wasOffline = useRef(false);
  const syncingRef = useRef(false);

  const refreshData = useCallback(() => {
    ["workers", "harvests-today", "attendance", "receipts"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  }, [qc]);

  const sync = useCallback(async (opts?: { silent?: boolean }) => {
    if (syncingRef.current) return;
    await loadQueue();
    if (pendingCount() === 0) { setPending(0); return; }
    syncingRef.current = true;
    setSyncing(true);
    try {
      const res = await syncQueue();
      setPending(res.remaining);
      if (res.synced > 0 && !opts?.silent) toast.success(`Sincronizado · ${res.synced} registro(s)`);
      if (res.remaining > 0 && !opts?.silent) toast.error(res.error || "Quedan registros por subir");
      if (res.synced > 0) refreshData();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refreshData]);

  useEffect(() => {
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      // Hydrate last-known server data so screens render offline.
      const persisted = (await storage.getItem<Record<string, any>>(CACHE_KEY, {})) || {};
      Object.entries(persisted).forEach(([k, v]) => { try { qc.setQueryData(JSON.parse(k), v); } catch {} });
      await loadQueue();
      setPending(pendingCount());
    })();

    const savePersist = () => {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        const map: Record<string, any> = {};
        qc.getQueryCache().getAll().forEach((q) => {
          const key = q.queryKey as any[];
          if (Array.isArray(key) && WHITELIST.includes(String(key[0])) && q.state.data !== undefined) {
            map[JSON.stringify(key)] = q.state.data;
          }
        });
        storage.setItem(CACHE_KEY, map).catch(() => {});
      }, 800);
    };

    const unsubCache = qc.getQueryCache().subscribe(savePersist);
    const unsubQueue = subscribe(() => setPending(pendingCount()));
    const handleOnline = (isOnline: boolean) => {
      setOnline(isOnline);
      if (isOnline && wasOffline.current) {
        wasOffline.current = false;
        setTimeout(() => sync({ silent: false }), 600);
      }
      if (!isOnline) wasOffline.current = true;
    };
    const unsubNet = NetInfo.addEventListener((state) => {
      handleOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    // Web preview / browsers: NetInfo can be unreliable, so also use the DOM events.
    let onUp: any, onDown: any;
    if (Platform.OS === "web" && typeof window !== "undefined" && window.addEventListener) {
      onUp = () => handleOnline(true);
      onDown = () => handleOnline(false);
      window.addEventListener("online", onUp);
      window.addEventListener("offline", onDown);
      if (typeof navigator !== "undefined" && navigator.onLine === false) handleOnline(false);
    }
    return () => {
      if (persistTimer) clearTimeout(persistTimer);
      unsubCache(); unsubQueue(); unsubNet();
      if (onUp) window.removeEventListener("online", onUp);
      if (onDown) window.removeEventListener("offline", onDown);
    };
  }, [sync, qc]);

  return <Ctx.Provider value={{ online, pending, syncing, sync }}>{children}</Ctx.Provider>;
}

export function useOffline() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOffline must be used within OfflineProvider");
  return ctx;
}
