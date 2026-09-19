/**
 * Локальная база. В зале и метро связи нет — приложение должно
 * полностью работать без сети и синхронизироваться потом.
 *
 * `outbox` — очередь изменений: каждая запись получает `op_id`,
 * по которому сервер отбрасывает повторы после обрыва связи.
 */
import Dexie, { type Table } from "dexie";

export type SyncEntity =
  | "workout_session"
  | "session_exercise"
  | "set_log"
  | "weight_entry"
  | "sleep_entry"
  | "meal_entry"
  | "water_log"
  | "supplement_log"
  | "diet_exception"
  | "habit_episode"
  | "habit_checkin"
  | "craving_log"
  | "challenge_entry"
  | "journal_entry"
  | "daily_log";

export interface OutboxItem {
  op_id: string;
  entity: SyncEntity;
  client_id: string;
  op: "upsert" | "delete";
  payload: Record<string, unknown>;
  client_updated_at: string;
  created_at: number;
  attempts: number;
  last_error?: string;
}

export interface CacheItem {
  key: string;
  payload: unknown;
  updated_at: number;
}

class TworldDb extends Dexie {
  outbox!: Table<OutboxItem, string>;
  cache!: Table<CacheItem, string>;

  constructor() {
    super("tworld");
    this.version(1).stores({
      outbox: "op_id, entity, client_id, created_at",
      cache: "key, updated_at",
    });
  }
}

export const db = new TworldDb();

/** Кэш ответов: экран открывается мгновенно и работает без сети. */
export async function cacheSet(key: string, payload: unknown) {
  try {
    await db.cache.put({ key, payload, updated_at: Date.now() });
  } catch {
    /* хранилище недоступно — не повод ломать экран */
  }
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const row = await db.cache.get(key);
    return row?.payload as T | undefined;
  } catch {
    return undefined;
  }
}
