import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../shared/api/client";
import { Card, Notice, Toggle } from "../../shared/ui/primitives";

interface Settings {
  max_per_day: number;
  push_enabled: boolean;
  morning_weigh_in_enabled: boolean;
  morning_weigh_in_time: string;
  bedtime_reminder_enabled: boolean;
  bedtime_reminder_minutes_before: number;
  habit_risk_reminder_enabled: boolean;
  quiet_hours_from: string;
  quiet_hours_to: string;
}

interface Schedule {
  max_per_day: number;
  vapid_public_key: string;
  items: { kind: string; at: string; title: string; body: string }[];
}

/** VAPID-ключ приходит строкой base64url, а подписке нужен Uint8Array. */
function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/**
 * Уведомления.
 *
 * Не больше двух в день по умолчанию, каждое отключается отдельно,
 * формулировки нейтральные. Уведомлений с укором в приложении нет
 * и не должно появиться.
 */
export function NotificationSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const [error, setError] = useState<string | null>(null);
  const settings = useQuery({
    queryKey: ["notification-settings"],
    queryFn: () => api.get<Settings>("/notifications/settings/"),
  });
  const schedule = useQuery({
    queryKey: ["notification-schedule"],
    queryFn: () => api.get<Schedule>("/notifications/schedule/"),
  });

  if (!settings.data) return null;

  const patch = async (body: Partial<Settings>) => {
    await api.patch("/notifications/settings/", body);
    await settings.refetch();
    await schedule.refetch();
  };

  const requestPermission = async () => {
    if (data.push_enabled) {
      await patch({ push_enabled: false });
      return;
    }
    if (!("Notification" in window)) {
      setError("Браузер не поддерживает уведомления.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setError("Разрешение не выдано. Уведомлений не будет — приложение работает и так.");
      return;
    }

    // Подписка на пуш: без неё уведомления приходят, только пока
    // приложение открыто.
    try {
      const key = schedule.data?.vapid_public_key;
      const registration = await navigator.serviceWorker?.ready;
      if (registration && key) {
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
        });
        const json = subscription.toJSON();
        await api.post("/notifications/push/", {
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          user_agent: navigator.userAgent.slice(0, 300),
        });
      } else if (!key) {
        setError(
          "На сервере не настроены ключи VAPID — уведомления будут приходить, " +
            "только пока приложение открыто.",
        );
      }
    } catch {
      setError("Не удалось подписаться на пуш. Разрешение сохранено.");
    }

    await patch({ push_enabled: true });
  };

  const data = settings.data;

  return (
    <Card title={embedded ? undefined : "Уведомления"} className={embedded ? "card--flat" : ""}>
      <div className="stack">
        <div className="row row--between">
          <span>
            Разрешить уведомления
            <br />
            <span className="tiny">
              На iPhone работают, только если приложение добавлено на домашний экран.
            </span>
          </span>
          <Toggle
            checked={data.push_enabled}
            label="Разрешить уведомления"
            onChange={() => void requestPermission()}
          />
        </div>

        <div className="row row--between">
          <span>
            Утром — взвеситься
            <br />
            <span className="tiny">в {data.morning_weigh_in_time?.slice(0, 5)}</span>
          </span>
          <Toggle
            checked={data.morning_weigh_in_enabled}
            label="Утром — взвеситься"
            onChange={() => void patch({ morning_weigh_in_enabled: !data.morning_weigh_in_enabled })}
          />
        </div>

        <div className="row row--between">
          <span>
            Вечером — про отбой
            <br />
            <span className="tiny">за {data.bedtime_reminder_minutes_before} минут до цели</span>
          </span>
          <Toggle
            checked={data.bedtime_reminder_enabled}
            label="Вечером — про отбой"
            onChange={() => void patch({ bedtime_reminder_enabled: !data.bedtime_reminder_enabled })}
          />
        </div>

        <div className="row row--between">
          <span>
            В личное рисковое время
            <br />
            <span className="tiny">час определяется по журналу тяги</span>
          </span>
          <Toggle
            checked={data.habit_risk_reminder_enabled}
            label="В личное рисковое время"
            onChange={() => void patch({ habit_risk_reminder_enabled: !data.habit_risk_reminder_enabled })}
          />
        </div>

        <label className="field">
          <span className="field__label">Не больше в день</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={5}
            defaultValue={data.max_per_day}
            onBlur={(event) => void patch({ max_per_day: Number(event.target.value) })}
          />
        </label>

        {schedule.data && schedule.data.items.length > 0 && (
          <div>
            <p className="field__label">Что придёт сегодня</p>
            <ul className="list">
              {schedule.data.items.map((item) => (
                <li key={item.kind} className="list__item">
                  <span className="grow">
                    {item.title}
                    <br />
                    <span className="tiny">{item.body}</span>
                  </span>
                  <span className="mono tiny">{item.at.slice(11, 16)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <Notice>{error}</Notice>}

        <Notice tone="info">
          Формулировки нейтральные: приложение не напоминает о пропусках
          и не ставит их в упрёк.
        </Notice>
      </div>
    </Card>
  );
}
