import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import { WeightTrendChart } from "../../shared/ui/charts";
import { Button, Card, Empty, Loading, Notice } from "../../shared/ui/primitives";
import { MeasurementSheet } from "../body/MeasurementSheet";
import { PhotoCompare } from "../body/PhotoCompare";
import { PhotoSheet } from "../body/PhotoSheet";
import { ScanSheet } from "../body/ScanSheet";

interface TrendResponse {
  summary: {
    trend_kg: string | null;
    raw_kg: string | null;
    change_7d: string | null;
    change_30d: string | null;
  };
  points: { date: string; trend_kg: string; raw_kg: string | null }[];
}

interface Measurement {
  id: number;
  date: string;
  site: string;
  site_label: string;
  value_cm: string;
}

interface LifeEvent {
  id: number;
  date_from: string;
  title: string;
  show_on_charts: boolean;
}

interface ScanSeries {
  fields: string[];
  points: Record<string, unknown>[];
  forecast: {
    current_pct: string;
    goal_pct: string;
    remaining_pct: number;
    eta: string | null;
    note?: string;
  } | null;
}

const FIELD_LABELS: Record<string, string> = {
  body_fat_pct: "жир, %",
  skeletal_muscle_kg: "мышцы, кг",
  total_water_l: "вода, л",
  visceral_fat_level: "висцеральный жир",
  bmr_kcal: "метаболизм, ккал",
};

export function BodyTab() {
  const [sheet, setSheet] = useState<null | "measure" | "scan" | "photo">(null);
  const trend = useQuery({
    queryKey: ["weight-trend"],
    queryFn: () => api.get<TrendResponse>("/body/weight/trend/"),
  });
  const measurements = useQuery({
    queryKey: ["measurements-latest"],
    queryFn: () => api.get<{ items: Measurement[]; note: string }>("/body/measurements/latest/"),
  });
  const scans = useQuery({
    queryKey: ["scan-series"],
    queryFn: () => api.get<ScanSeries>("/body/scans/series/"),
  });
  const { data: events } = useList<LifeEvent>(["life-events"], "/journal/events/");

  if (trend.isLoading) return <Loading />;

  const points = (trend.data?.points ?? []).map((point) => ({
    date: point.date,
    trend_kg: Number(point.trend_kg),
    raw_kg: point.raw_kg !== null ? Number(point.raw_kg) : null,
  }));

  const marks = (events ?? [])
    .filter((event) => event.show_on_charts)
    .map((event) => ({ date: event.date_from, title: event.title }));

  return (
    <>
      <Card title="Вес" icon="scale" tone="blue">
        <p className="hero-number">
          {trend.data?.summary.trend_kg ? Number(trend.data.summary.trend_kg).toFixed(1) : "—"}
          <span className="muted" style={{ fontSize: "var(--font-size-lg)" }}> кг тренда</span>
        </p>
        <p className="tiny">
          последнее взвешивание{" "}
          {trend.data?.summary.raw_kg ? `${Number(trend.data.summary.raw_kg).toFixed(1)} кг` : "—"}
        </p>
        {points.length > 1 ? (
          <WeightTrendChart points={points} events={marks} />
        ) : (
          <Empty>Тренд появится после нескольких взвешиваний.</Empty>
        )}
      </Card>

      <Card
        title="Обхваты"
        action={
          <button type="button" className="card__action" onClick={() => setSheet("measure")}>
            Записать
          </button>
        }
      >
        {measurements.data?.items.length ? (
          <>
            <ul className="list">
              {measurements.data.items.map((item) => (
                <li key={item.id} className="list__item">
                  <span className="grow">
                    {item.site_label}
                    {item.site === "waist" && <span className="tiny"> · главный показатель</span>}
                  </span>
                  <span className="mono">{Number(item.value_cm).toFixed(1)} см</span>
                  <span className="tiny">{item.date}</span>
                </li>
              ))}
            </ul>
            <p className="tiny" style={{ marginTop: "var(--space-2)" }}>
              {measurements.data.note}
            </p>
          </>
        ) : (
          <Empty>Замеров сантиметром пока нет.</Empty>
        )}
      </Card>

      <Card
        title="Состав тела"
        action={
          <button type="button" className="card__action" onClick={() => setSheet("scan")}>
            Внести
          </button>
        }
      >
        {scans.data?.points.length ? (
          <>
            <ul className="list">
              {Object.entries(FIELD_LABELS).map(([field, label]) => {
                const last = scans.data!.points[scans.data!.points.length - 1];
                const first = scans.data!.points[0];
                const value = last[field] as string | number | null;
                const start = first[field] as string | number | null;
                if (value === null || value === undefined) return null;
                const delta =
                  start !== null && start !== undefined
                    ? Number(value) - Number(start)
                    : null;
                return (
                  <li key={field} className="list__item">
                    <span className="grow">{label}</span>
                    <span className="mono">{Number(value).toFixed(1)}</span>
                    {delta !== null && (
                      <span className="tiny">
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(1)} за период
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div style={{ marginTop: "var(--space-3)" }}>
              <Notice tone="info">
                Прирост «мышечной массы» между замерами частично объясняется водой
                и гликогеном. Сравнимы только замеры в одинаковых условиях:
                одно время дня, до тренировки.
              </Notice>
            </div>
            {scans.data.forecast?.eta && (
              <p className="muted" style={{ marginTop: "var(--space-3)" }}>
                До {Number(scans.data.forecast.goal_pct)}% жира осталось{" "}
                {scans.data.forecast.remaining_pct.toFixed(1)} п.п. — при текущем темпе
                примерно к {scans.data.forecast.eta}.
              </p>
            )}
          </>
        ) : (
          <Empty>Данных анализатора состава тела пока нет.</Empty>
        )}
      </Card>

      <Card title="Прогресс-фото" icon="camera" tone="pink">
        <p className="tiny" style={{ marginBottom: "var(--space-2)" }}>
          Контур в кадре помогает встать так же, как в прошлый раз — без этого
          сравнение «до/после» мало что показывает.
        </p>
        <Button onClick={() => setSheet("photo")}>Сделать снимок</Button>
      </Card>

      <PhotoCompare />

      <MeasurementSheet
        open={sheet === "measure"}
        onClose={() => setSheet(null)}
        onSaved={() => void measurements.refetch()}
      />
      <ScanSheet
        open={sheet === "scan"}
        onClose={() => setSheet(null)}
        onSaved={() => void scans.refetch()}
      />
      <PhotoSheet open={sheet === "photo"} onClose={() => setSheet(null)} onSaved={() => undefined} />
    </>
  );
}
