import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ReactNode } from "react";

/**
 * Графики.
 *
 * Цвета берутся из токенов через CSS-переменные — подключение реального
 * стиля меняет и графики тоже. Метки значимых событий рисуются
 * вертикальными линиями: провал получает объяснение, а не повод
 * для самобичевания.
 */
const AXIS = { stroke: "var(--chart-axis)", fontSize: 11 };

export interface EventMark {
  date: string;
  title: string;
}

export function ChartFrame({
  children,
  height = 220,
  legend,
}: {
  children: ReactNode;
  height?: number;
  legend?: ReactNode;
}) {
  return (
    <>
      <div className="chart-wrap" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as never}
        </ResponsiveContainer>
      </div>
      {legend && <div className="chart-legend">{legend}</div>}
    </>
  );
}

export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <i className="chart-legend__swatch" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Тренд-вес жирной линией, сырые точки — бледные и мелкие. */
export function WeightTrendChart({
  points,
  events = [],
}: {
  points: { date: string; trend_kg: number | null; raw_kg: number | null }[];
  events?: EventMark[];
}) {
  return (
    <ChartFrame
      legend={
        <>
          <LegendSwatch color="var(--chart-trend)" label="тренд (7 дней)" />
          <LegendSwatch color="var(--chart-raw)" label="сырой вес" />
          {events.length > 0 && <LegendSwatch color="var(--chart-event)" label="события" />}
        </>
      }
    >
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={shortDate} minTickGap={28} />
        <YAxis tick={AXIS} domain={["dataMin - 1", "dataMax + 1"]} width={44} />
        <Tooltip {...tooltipProps} />
        {events.map((event) => (
          <ReferenceLine
            key={`${event.date}-${event.title}`}
            x={event.date}
            stroke="var(--chart-event)"
            strokeDasharray="3 3"
            label={{ value: event.title, position: "top", fontSize: 10, fill: "var(--chart-event)" }}
          />
        ))}
        <Line
          type="monotone"
          dataKey="raw_kg"
          stroke="var(--chart-raw)"
          strokeWidth={1}
          dot={{ r: 1.5, fill: "var(--chart-raw)" }}
          connectNulls
          name="сырой"
        />
        <Line
          type="monotone"
          dataKey="trend_kg"
          stroke="var(--chart-trend)"
          strokeWidth={2.5}
          dot={false}
          connectNulls
          name="тренд"
        />
      </LineChart>
    </ChartFrame>
  );
}

/**
 * Сон и самочувствие в зале на одних осях.
 *
 * Самая убедительная визуализация: зависимость, которую словами
 * объяснить не удаётся, человек видит своими глазами.
 */
export function SleepVsWellbeingChart({
  points,
}: {
  points: { date: string; sleep_minutes: number | null; wellbeing_1_10: number | null }[];
}) {
  const data = points.map((point) => ({
    ...point,
    sleep_hours: point.sleep_minutes ? Number((point.sleep_minutes / 60).toFixed(2)) : null,
  }));
  return (
    <ChartFrame
      legend={
        <>
          <LegendSwatch color="var(--chart-1)" label="сон, часов" />
          <LegendSwatch color="var(--chart-3)" label="самочувствие 1–10" />
        </>
      }
    >
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={shortDate} minTickGap={28} />
        <YAxis yAxisId="left" tick={AXIS} width={30} domain={[0, 12]} />
        <YAxis yAxisId="right" orientation="right" tick={AXIS} width={24} domain={[0, 10]} />
        <Tooltip {...tooltipProps} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="sleep_hours"
          name="сон, ч"
          stroke="var(--chart-1)"
          fill="var(--chart-5)"
          connectNulls
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="wellbeing_1_10"
          name="самочувствие"
          stroke="var(--chart-3)"
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
      </AreaChart>
    </ChartFrame>
  );
}

export function SimpleLineChart({
  data,
  dataKey,
  name,
  events = [],
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  name: string;
  events?: EventMark[];
}) {
  return (
    <ChartFrame height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickFormatter={shortDate} minTickGap={28} />
        <YAxis tick={AXIS} width={40} />
        <Tooltip {...tooltipProps} />
        {events.map((event) => (
          <ReferenceLine
            key={event.date}
            x={event.date}
            stroke="var(--chart-event)"
            strokeDasharray="3 3"
          />
        ))}
        <Line
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 2 }}
          connectNulls
        />
      </LineChart>
    </ChartFrame>
  );
}

export function CorrelationScatter({
  points,
  xLabel,
  yLabel,
}: {
  points: { x: number; y: number }[];
  xLabel: string;
  yLabel: string;
}) {
  return (
    <ChartFrame height={200}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: -18 }}>
        <CartesianGrid stroke="var(--chart-grid)" />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          tick={AXIS}
          label={{ value: xLabel, position: "insideBottom", offset: -8, fontSize: 10 }}
        />
        <YAxis type="number" dataKey="y" name={yLabel} tick={AXIS} width={40} />
        <ZAxis range={[40, 40]} />
        <Tooltip {...tooltipProps} cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={points} fill="var(--chart-2)" />
      </ScatterChart>
    </ChartFrame>
  );
}

const tooltipProps = {
  contentStyle: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    fontSize: 12,
    color: "var(--color-text)",
  },
  labelStyle: { color: "var(--color-text-secondary)" },
};

function shortDate(value: string) {
  if (!value || value.length < 10) return value;
  return `${value.slice(8, 10)}.${value.slice(5, 7)}`;
}
