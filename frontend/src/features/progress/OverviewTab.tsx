import { useQuery } from "@tanstack/react-query";

import { api } from "../../shared/api/client";
import { Card, Loading, Notice } from "../../shared/ui/primitives";

interface WeakLinkResponse {
  week: { from: string; to: string };
  weak_link: { found: boolean; title: string; detail: string; focus: string };
  what_worked: string[];
  metrics: {
    workouts: { count: number; tonnage_kg: number; avg_duration_seconds: number; avg_wellbeing: number | null };
    weight: { trend_end_kg: number | null; change_kg: number | null };
    sleep: { average_minutes: number | null; debt_minutes: number; target_minutes: number; bedtime: { hits: number; nights: number } };
    protein: { days_on_target: number; days_logged: number; average_g: number | null; target_g: number };
    discipline: { discipline_percent: number | null; excused: number };
  };
}

/** Обзор недели. Все цифры недельные: один плохой день ничего не значит. */
export function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["weak-link"],
    queryFn: () => api.get<WeakLinkResponse>("/analytics/weak-link/"),
  });

  if (isLoading || !data) return <Loading />;
  const { metrics } = data;

  return (
    <>
      <Card title="Слабое звено недели">
        <p className="big-number">{data.weak_link.title}</p>
        <p className="muted">{data.weak_link.detail}</p>
        <div style={{ marginTop: "var(--space-3)" }}>
          <Notice tone="info">
            <strong>Один фокус на следующую неделю:</strong> {data.weak_link.focus}
          </Notice>
        </div>
      </Card>

      {data.what_worked.length > 0 && (
        <Card title="Что сработало">
          <ul className="list">
            {data.what_worked.map((item) => (
              <li key={item} className="list__item">
                {item}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="cols-2">
        <Card title="Тренировки">
          <p className="big-number">{metrics.workouts.count}</p>
          <p className="muted">
            тоннаж {metrics.workouts.tonnage_kg.toFixed(0)} кг
            {metrics.workouts.avg_wellbeing && ` · самочувствие ${metrics.workouts.avg_wellbeing}/10`}
          </p>
        </Card>

        <Card title="Тренд-вес">
          <p className="big-number">
            {metrics.weight.trend_end_kg ? `${metrics.weight.trend_end_kg.toFixed(1)} кг` : "—"}
          </p>
          <p className="muted">
            {metrics.weight.change_kg !== null
              ? `${metrics.weight.change_kg > 0 ? "+" : ""}${metrics.weight.change_kg.toFixed(2)} кг за неделю`
              : "мало данных"}
          </p>
        </Card>

        <Card title="Сон">
          <p className="big-number">
            {metrics.sleep.average_minutes
              ? `${Math.floor(metrics.sleep.average_minutes / 60)} ч ${String(metrics.sleep.average_minutes % 60).padStart(2, "0")}`
              : "—"}
          </p>
          <p className="muted">
            в целевой отбой {metrics.sleep.bedtime.hits} из {metrics.sleep.bedtime.nights} ·
            долг {Math.round(metrics.sleep.debt_minutes / 60)} ч
          </p>
        </Card>

        <Card title="Белок">
          <p className="big-number">
            {metrics.protein.days_on_target}/{metrics.protein.days_logged}
          </p>
          <p className="muted">
            дней в норме · в среднем {metrics.protein.average_g ?? "—"} г
            при цели {metrics.protein.target_g} г
          </p>
        </Card>
      </div>

      <Card title="Дисциплина">
        <p className="big-number">
          {metrics.discipline.discipline_percent !== null
            ? `${metrics.discipline.discipline_percent}%`
            : "—"}
        </p>
        <p className="muted">
          Пропуски по внешним причинам не учитываются
          {metrics.discipline.excused > 0 && ` (их ${metrics.discipline.excused})`}.
        </p>
      </Card>
    </>
  );
}
