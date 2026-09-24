/**
 * Очередь синхронизации.
 *
 * Запись сначала попадает в IndexedDB, потом уходит на сервер.
 * Повтор той же операции после обрыва связи безопасен: сервер
 * различает операции по `op_id`.
 */
import { api } from "../api/client";
import { db, type OutboxItem, type SyncEntity } from "./db";

type Listener = (pending: number) => void;

const listeners = new Set<Listener>();
let syncing = false;

export function onQueueChange(listener: Listener) {
  listeners.add(listener);
  void notify();
  return () => listeners.delete(listener);
}

async function notify() {
  let count = 0;
  try {
    count = await db.outbox.count();
  } catch {
    count = 0;
  }
  listeners.forEach((listener) => listener(count));
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function enqueue(
  entity: SyncEntity,
  payload: Record<string, unknown>,
  options: { clientId?: string; op?: "upsert" | "delete" } = {},
): Promise<string> {
  const clientId = options.clientId ?? newId();
  const item: OutboxItem = {
    op_id: newId(),
    entity,
    client_id: clientId,
    op: options.op ?? "upsert",
    payload,
    client_updated_at: new Date().toISOString(),
    created_at: Date.now(),
    attempts: 0,
  };
  try {
    await db.outbox.add(item);
  } catch {
    // Если IndexedDB недоступна (приватный режим), отправляем напрямую.
    await api.post("/sync/push/", { operations: [item] });
    return clientId;
  }
  void notify();
  void flush();
  return clientId;
}

export async function flush(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const batch = await db.outbox.orderBy("created_at").limit(100).toArray();
    if (batch.length === 0) return;

    const response = await api.post<{ results: { op_id: string; status: string; detail?: string }[] }>(
      "/sync/push/",
      { operations: batch },
    );

    const settled = new Set<string>();
    for (const result of response.results ?? []) {
      if (["applied", "duplicate", "deleted", "stale"].includes(result.status)) {
        settled.add(result.op_id);
      } else {
        // Операция не применилась — оставляем в очереди с пометкой.
        await db.outbox.update(result.op_id, {
          attempts: (batch.find((i) => i.op_id === result.op_id)?.attempts ?? 0) + 1,
          last_error: result.detail ?? result.status,
        });
      }
    }
    if (settled.size) await db.outbox.bulkDelete([...settled]);
    void notify();
  } catch {
    // Нет сети — попробуем в следующий раз. Данные не потеряны.
  } finally {
    syncing = false;
  }
}

export function startAutoSync(intervalMs = 20000) {
  const run = () => void flush();
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
  const timer = window.setInterval(run, intervalMs);
  run();
  return () => {
    window.removeEventListener("online", run);
    window.clearInterval(timer);
  };
}
