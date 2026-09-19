import { useQuery } from "@tanstack/react-query";

import { api } from "../../shared/api/client";
import { Card, Chip, Notice } from "../../shared/ui/primitives";

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
  items: { kind: string; at: string; title: string; body: string }[];
}

/**
 * Уведомления.
 *
 * Не больше двух в день по умолчанию, каждое отключается отдельно,
 * формулировки нейтральные. Уведомлений с укором в приложении нет
 * и не должно появиться.
 */
export function NotificationSettings() {
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
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    await patch({ push_enabled: result === "granted" });
  };

  const data = settings.data;

  return (
    <Card title="Уведомления">
      <div className="stack">
        <div className="row row--between">
          <span>
            Разрешить уведомления
            <br />
            <span className="tiny">
              На iPhone работают, только если приложение добавлено на домашний экран.
            </span>
          </span>
          <Chip pressed={data.push_enabled} onClick={() => void requestPermission()}>
            {data.push_enabled ? "вкл" : "выкл"}
          </Chip>
        </div>

        <div className="row row--between">
          <span>
            Утром — взвеситься
            <br />
            <span className="tiny">в {data.morning_weigh_in_time?.slice(0, 5)}</span>
          </span>
          <Chip
            pressed={data.morning_weigh_in_enabled}
            onClick={() => void patch({ morning_weigh_in_enabled: !data.morning_weigh_in_enabled })}
          >
            {data.morning_weigh_in_enabled ? "вкл" : "выкл"}
          </Chip>
        </div>

        <div className="row row--between">
          <span>
            Вечером — про отбой
            <br />
            <span className="tiny">за {data.bedtime_reminder_minutes_before} минут до цели</span>
          </span>
          <Chip
            pressed={data.bedtime_reminder_enabled}
            onClick={() => void patch({ bedtime_reminder_enabled: !data.bedtime_reminder_enabled })}
          >
            {data.bedtime_reminder_enabled ? "вкл" : "выкл"}
          </Chip>
        </div>

        <div className="row row--between">
          <span>
            В личное рисковое время
            <br />
            <span className="tiny">час определяется по журналу тяги</span>
          </span>
          <Chip
            pressed={data.habit_risk_reminder_enabled}
            onClick={() =>
              void patch({ habit_risk_reminder_enabled: !data.habit_risk_reminder_enabled })
            }
          >
            {data.habit_risk_reminder_enabled ? "вкл" : "выкл"}
          </Chip>
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

        <Notice tone="info">
          Формулировки нейтральные: приложение не напоминает о пропусках
          и не ставит их в упрёк.
        </Notice>
      </div>
    </Card>
  );
}
