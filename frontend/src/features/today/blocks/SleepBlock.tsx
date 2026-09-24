import { useState } from "react";

import { api } from "../../../shared/api/client";
import type { TodayPayload } from "../../../shared/api/types";
import { Card, IconTile, Notice } from "../../../shared/ui/primitives";

function minutesLabel(minutes: number | null) {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)} ч ${String(minutes % 60).padStart(2, "0")} мин`;
}

function isoForNight(time: string, nextDay: boolean) {
  const base = new Date();
  base.setDate(base.getDate() - (nextDay ? 0 : 1));
  const [hours, minutes] = time.split(":").map(Number);
  base.setHours(hours, minutes, 0, 0);
  return base.toISOString();
}

/**
 * Сон за прошлую ночь.
 *
 * Отбой и подъём вводятся как время, а не галочкой «лёг вовремя»:
 * галочка не показывает, промахнулся ты на 10 минут или на два часа.
 * Поля предзаполнены привычными значениями — обычно править не нужно.
 */
export function SleepBlock({
  data,
  onChanged,
}: {
  data: TodayPayload["sleep"];
  onChanged: () => void;
}) {
  const [bed, setBed] = useState(data.prefill.bed_time ?? "23:30");
  const [wake, setWake] = useState(data.prefill.wake_time ?? "07:00");
  const [saving, setSaving] = useState(false);

  const logged = data.last_night.duration_minutes !== null;

  const save = async (nextBed: string, nextWake: string) => {
    if (!nextBed || !nextWake) return;
    setSaving(true);
    try {
      const night = new Date();
      night.setDate(night.getDate() - 1);
      await api.post("/sleep/", {
        night_of: night.toISOString().slice(0, 10),
        // Отбой после полуночи относится к той же ночи — считаем это здесь,
        // чтобы пользователю не приходилось думать про даты.
        bed_time: isoForNight(nextBed, Number(nextBed.slice(0, 2)) < 12),
        wake_time: isoForNight(nextWake, true),
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="card--tight">
      <div className="metric">
        <IconTile icon="moon" tone="purple" />
        <div className="metric__body" style={{ gap: 2 }}>
          <span className="metric__label">
            Сон
            {data.last_night.source && data.last_night.source !== "manual" && (
              <span className="tiny"> · из Health</span>
            )}
          </span>
          {logged ? (
            <span className="big-number">{minutesLabel(data.last_night.duration_minutes)}</span>
          ) : (
            <span className="tiny">Во сколько лёг и встал — поля уже заполнены привычным</span>
          )}
        </div>
        {logged && data.last_night.bed_time && data.last_night.wake_time && (
          <span className="tiny" style={{ alignSelf: "flex-end" }}>
            {clock(data.last_night.bed_time)} — {clock(data.last_night.wake_time)}
          </span>
        )}
      </div>

      {!logged && (
        <div className="row" style={{ gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
          <label className="field grow">
            <span className="field__label">Отбой</span>
            <input
              type="time"
              value={bed}
              onChange={(event) => {
                setBed(event.target.value);
                void save(event.target.value, wake);
              }}
            />
          </label>
          <label className="field grow">
            <span className="field__label">Подъём</span>
            <input
              type="time"
              value={wake}
              onChange={(event) => {
                setWake(event.target.value);
                void save(bed, event.target.value);
              }}
            />
          </label>
        </div>
      )}

      {saving && <p className="tiny">Сохраняем…</p>}

      {data.warning && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Notice>{data.warning.message}</Notice>
        </div>
      )}
    </Card>
  );
}

/** ISO-время или «23:42:00» → «23:42». */
function clock(value: string) {
  if (value.includes("T")) {
    return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  return value.slice(0, 5);
}
