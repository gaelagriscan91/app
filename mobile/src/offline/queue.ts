import * as Crypto from "expo-crypto";
import { storage } from "@/src/utils/storage";
import api, { apiErrorMessage } from "@/src/api/client";

export type OpType = "worker" | "harvest" | "attendance";

export type QueueOp = {
  id: string;
  type: OpType;
  payload: any;
  tempWorkerId?: string; // for type "worker": the local temp id other ops may reference
  createdAt: string;
};

const KEY = "offline_queue_v1";
let queue: QueueOp[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }
function persist() { storage.setItem(KEY, queue).catch(() => {}); }

export async function loadQueue(): Promise<QueueOp[]> {
  if (!loaded) {
    queue = (await storage.getItem<QueueOp[]>(KEY, [])) || [];
    loaded = true;
  }
  return queue;
}

export function getQueue() { return queue; }
export function pendingCount() { return queue.length; }

export function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function newTempId() { return `tmp_${Crypto.randomUUID()}`; }

export function enqueue(op: Omit<QueueOp, "id" | "createdAt">) {
  const full: QueueOp = { ...op, id: Crypto.randomUUID(), createdAt: new Date().toISOString() };
  queue = [...queue, full];
  persist();
  emit();
  return full;
}

/** Replay the queue in order. Worker ops run first so their real ids can be remapped into later ops. */
export async function syncQueue(): Promise<{ synced: number; remaining: number; error?: string }> {
  await loadQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const idMap: Record<string, string> = {};
  let synced = 0;
  let error: string | undefined;

  // Process in insertion order; a worker always appears before the ops that reference it.
  const remaining: QueueOp[] = [];
  for (const op of queue) {
    try {
      if (op.type === "worker") {
        const { data } = await api.post("/workers", op.payload);
        if (op.tempWorkerId) idMap[op.tempWorkerId] = data.id;
      } else if (op.type === "harvest") {
        const payload = { ...op.payload };
        if (payload.worker_id && idMap[payload.worker_id]) payload.worker_id = idMap[payload.worker_id];
        await api.post("/harvests", payload);
      } else if (op.type === "attendance") {
        const payload = { ...op.payload };
        if (payload.code && idMap[payload.code]) payload.code = idMap[payload.code];
        await api.post("/attendance/scan", payload);
      }
      synced += 1;
    } catch (e: any) {
      const status = e?.response?.status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        // Permanent error (e.g. duplicate, validation) — drop the op so the queue never jams.
        synced += 1;
      } else {
        // Network / server error — stop and keep this and the rest for the next attempt.
        error = apiErrorMessage(e, "Sin conexión");
        remaining.push(op, ...queue.slice(queue.indexOf(op) + 1));
        break;
      }
    }
  }

  queue = remaining;
  persist();
  emit();
  return { synced, remaining: queue.length, error };
}
