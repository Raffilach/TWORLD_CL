import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import { CorrelationScatter } from "../../shared/ui/charts";
import { Card, Chip, Empty, Loading } from "../../shared/ui/primitives";

interface Correlation {
  key: string;
  title: string;
  samples: number;
  rho: number | null;
  strength: string;
  points: { date: string; x: number; y: number }[];
  note: string;
}

interface Standard {
  id: number;
  name: string;
  target_value: string;
  current_value: string | null;
  unit: string;
  deadline: string | null;
}

interface HeatmapDay {
  date: string;
  score: number;
}

export function AnalyticsTab() {
  const [openCorrelation, setOpenCorrelation] = useState<string | null>(null);

  const correlations = useQuery({
    queryKey: ["correlations"],
    queryFn: () =>
      api.get<{ correlations: Correlation[] }>("/analytics/correlations/"),
  });
  const heatmap = useQuery({
    queryKey: ["heatmap"],
    queryFn: () => api.get<{ year: number; days: HeatmapDay[] }>("/analytics/heatmap/"),
  });
  const compare = useQuery({
    queryKey: ["compare"],
    queryFn: () =>
      api.get<{
        a: { period: { from: string; to: string }; workouts: { count: number; tonnage_kg: number } };
        b: { period: { from: string; to: string }; workouts: { count: number; tonnage_kg: number } };
      }>("/analytics/compare/"),
  });
  const standards = useList<Standard>(["standards"], "/standards/");

  if (correlations.isLoading) return <Loading />;

  return (
    <>
      <Card title="Корреляции" icon="sparkle" tone="purple">
        <ul className="list">
          {correlations.data?.correlations.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className="list__item"
                onClick={() => setOpenCorrelation(openCorrelation === item.key ? null : item.key)}
              >
                <span className="grow">
                  {item.title}
                  <br />
                  <span className="tiny">
                    {item.strength}
                    {item.rho !== null && ` · ρ = ${item.rho}`} · наблюдений {item.samples}
                  </span>
                </span>
                <span aria-hidden="true">{openCorrelation === item.key ? "▴" : "▾"}</span>
              </button>
              {openCorrelation === item.key && item.points.length > 3 && (
                <div style={{ padding: "var(--space-2) 0" }}>
                  <CorrelationScatter
                    points={item.points}
                    xLabel={item.title.split("→")[0].trim()}
                    yLabel={item.title.split("→")[1]?.trim() ?? ""}
                  />
                  <p className="tiny">{item.note}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Сравнение недель" icon="chart" tone="blue">
        {compare.data ? (
          <div className="row row--between">
            <div>
              <p className="tiny">{compare.data.b.period.from} — {compare.data.b.period.to}</p>
              <p className="big-number">{compare.data.b.workouts.count}</p>
              <p className="tiny">{compare.data.b.workouts.tonnage_kg.toFixed(0)} кг</p>
            </div>
            <span aria-hidden="true">→</span>
            <div>
              <p className="tiny">{compare.data.a.period.from} — {compare.data.a.period.to}</p>
              <p className="big-number">{compare.data.a.workouts.count}</p>
              <p className="tiny">{compare.data.a.workouts.tonnage_kg.toFixed(0)} кг</p>
            </div>
          </div>
        ) : (
          <Empty>Нет данных для сравнения.</Empty>
        )}
      </Card>

      <Card title={`Календарь ${heatmap.data?.year ?? ""}`} icon="calendar" tone="teal">
        {heatmap.data?.days.length ? (
          <div className="heatmap">
            {heatmap.data.days.map((day) => (
              <span
                key={day.date}
                className="heatmap__cell"
                title={`${day.date}: отмечено ${day.score}`}
                style={{
                  background:
                    day.score === 0
                      ? "var(--color-surface-sunken)"
                      : `var(--chart-${Math.min(5, 6 - day.score)})`,
                }}
              />
            ))}
          </div>
        ) : (
          <Empty>Данных за год пока нет.</Empty>
        )}
      </Card>

      <Card title="Нормативы" icon="target" tone="orange">
        {standards.data?.length ? (
          <ul className="list">
            {standards.data.map((standard) => (
              <li key={standard.id} className="list__item">
                <span className="grow">
                  {standard.name}
                  {standard.deadline && <span className="tiny"> · до {standard.deadline}</span>}
                </span>
                <span className="mono">
                  {standard.current_value ? Number(standard.current_value).toFixed(0) : "—"} /{" "}
                  {Number(standard.target_value).toFixed(0)} {standard.unit}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Нормативы не заданы.</Empty>
        )}
        <div className="row" style={{ marginTop: "var(--space-2)" }}>
          <Chip
            small
            onClick={async () => {
              await api.post("/standards/refresh/", {});
              await standards.refetch();
            }}
          >
            Обновить из рекордов
          </Chip>
        </div>
      </Card>
    </>
  );
}
