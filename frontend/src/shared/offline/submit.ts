/**
 * Запись данных, которая переживает отсутствие сети.
 *
 * Сначала пробуем отправить сразу — так пользователь получает ответ сервера
 * (предупреждения о лимите веса, побитые рекорды). Если сети нет или запрос
 * сорвался, запись уходит в очередь и отправится позже: в зале и метро это
 * нормальный режим, а не сбой.
 *
 * Ошибки валидации (4xx) в очередь НЕ уходят: они не исправятся сами,
 * и прятать их за «синхронизируем потом» было бы враньём.
 */
import { ApiError, api } from "../api/client";
import { enqueue, newId } from "./queue";
import type { SyncEntity } from "./db";

export interface SubmitResult<T> {
  queued: boolean;
  clientId: string;
  data?: T;
}

export async function submitOrQueue<T>(
  entity: SyncEntity,
  path: string,
  payload: Record<string, unknown>,
): Promise<SubmitResult<T>> {
  const clientId = (payload.client_id as string) || newId();
  const body = { ...payload, client_id: clientId };

  if (navigator.onLine) {
    try {
      const data = await api.post<T>(path, body);
      return { queued: false, clientId, data };
    } catch (error) {
      // Сервер ответил и отказал — это не проблема связи.
      if (error instanceof ApiError) throw error;
    }
  }

  await enqueue(entity, body, { clientId });
  return { queued: true, clientId };
}
