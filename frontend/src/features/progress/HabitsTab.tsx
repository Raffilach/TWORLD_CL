import { useQuery } from "@tanstack/react-query";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import type { Habit } from "../../shared/api/types";
import { Card, Empty, Loading } from "../../shared/ui/primitives";

interface Patterns {
  samples: number;
  by_hour: Record<string, number>;
  by_weekday: Record<string, number>;
  by_trigger: Record<string, number>;
  riskiest_hour: number | null;
  riskiest_hour_share?: number;
  resisted_rate?: number;
  what_helps: string[];
}

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export function HabitsTab() {
  const habits = useList<Habit>(["habits"], "/habits/");
  const patterns = useQuery({
    queryKey: ["craving-patterns"],
    queryFn: () => api.get<Patterns>("/cravings/patterns/"),
  });

  if (habits.isLoading) return <Loading />;

  const maxHour = Math.max(1, ...Object.values(patterns.data?.by_hour ?? { 0: 1 }));

  return (
    <>
      {habits.data?.map((habit) => (
        <Card key={habit.id} title={habit.name}>
          <div className="row row--between">
            <div>
              <p className="big-number">{habit.stats.current_streak}</p>
              <p className="tiny">текущая серия</p>
            </div>
            <div>
              <p className="big-number">{habit.stats.days_since_decision}</p>
              <p className="tiny">дней с решения</p>
            </div>
            <div>
              <p className="big-number">{habit.stats.total_clean_days}</p>
              <p className="tiny">чистых дней всего</p>
            </div>
          </div>
          <p className="muted" style={{ marginTop: "var(--space-3)" }}>
            Срывов отмечено: {habit.stats.episodes_count}. История не стирается —
            обнуляется только текущая серия.
          </p>
          {habit.stats.money_saved && (
            <p className="muted">Сэкономлено: {Number(habit.stats.money_saved).toFixed(0)} ₽</p>
          )}
        </Card>
      ))}

      {habits.data?.length === 0 && <Empty>Привычек пока нет.</Empty>}

      {patterns.data && patterns.data.samples > 0 && (
        <Card title="Карта тяги">
          <p className="muted">
            {patterns.data.samples} записей
            {patterns.data.riskiest_hour !== null && (
              <>
                {" "}· риск выше всего около {patterns.data.riskiest_hour}:00
                {patterns.data.riskiest_hour_share && ` (${patterns.data.riskiest_hour_share}%)`}
              </>
            )}
          </p>

          <div className="row" style={{ alignItems: "flex-end", gap: 2, height: 80, marginTop: "var(--space-3)" }}>
            {Array.from({ length: 24 }, (_, hour) => {
              const value = patterns.data!.by_hour[String(hour)] ?? 0;
              return (
                <span
                  key={hour}
                  title={`${hour}:00 — ${value}`}
                  style={{
                    flex: 1,
                    height: `${(value / maxHour) * 100}%`,
                    minHeight: 2,
                    background: "var(--chart-2)",
                    borderRadius: 2,
                  }}
                />
              );
            })}
          </div>
          <p className="tiny">часы суток, 0–23</p>

          <ul className="list" style={{ marginTop: "var(--space-3)" }}>
            {Object.entries(patterns.data.by_trigger)
              .slice(0, 5)
              .map(([trigger, count]) => (
                <li key={trigger} className="list__item">
                  <span className="grow">{trigger}</span>
                  <span className="mono">{count}</span>
                </li>
              ))}
          </ul>

          {patterns.data.what_helps.length > 0 && (
            <p className="muted" style={{ marginTop: "var(--space-2)" }}>
              Помогало: {patterns.data.what_helps.join(", ")}
            </p>
          )}

          <div className="row row--wrap" style={{ marginTop: "var(--space-3)", gap: 2 }}>
            {WEEKDAYS.map((day, index) => (
              <span key={day} className="badge">
                {day}: {patterns.data!.by_weekday[String(index)] ?? 0}
              </span>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
