import { useQuery } from "@tanstack/react-query";

import { api } from "../../shared/api/client";
import { SleepVsWellbeingChart } from "../../shared/ui/charts";
import { Card, Empty, Loading, Notice } from "../../shared/ui/primitives";

interface SleepStats {
  debt: {
    target_minutes: number;
    nights_logged: number;
    average_minutes: number | null;
    debt_minutes: number;
  };
  bedtime: {
    goal: string | null;
    nights: number;
    hits: number;
    percent: number | null;
    average_deviation_minutes: number | null;
  };
  warning: { message: string } | null;
  vs_wellbeing: { date: string; sleep_minutes: number | null; wellbeing_1_10: number | null }[];
}

export function SleepTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["sleep-stats"],
    queryFn: () => api.get<SleepStats>("/sleep/stats/"),
  });

  if (isLoading || !data) return <Loading />;

  return (
    <>
      {data.warning && (
        <div style={{ marginBottom: "var(--space-3)" }}>
          <Notice>{data.warning.message}</Notice>
        </div>
      )}

      <div className="cols-2">
        <Card title="Средний сон">
          <p className="big-number">
            {data.debt.average_minutes
              ? `${Math.floor(data.debt.average_minutes / 60)} ч ${String(data.debt.average_minutes % 60).padStart(2, "0")}`
              : "—"}
          </p>
          <p className="muted">
            цель {Math.floor(data.debt.target_minutes / 60)} ч · {data.debt.nights_logged} ночей
          </p>
        </Card>

        <Card title="Долг сна">
          <p className="big-number">{Math.round(data.debt.debt_minutes / 60)} ч</p>
          <p className="muted">накоплено за период</p>
        </Card>

        <Card title="Целевой отбой">
          <p className="big-number">
            {data.bedtime.hits}/{data.bedtime.nights}
          </p>
          <p className="muted">
            цель {data.bedtime.goal ?? "—"}
            {data.bedtime.average_deviation_minutes !== null &&
              ` · в среднем ${data.bedtime.average_deviation_minutes > 0 ? "позже" : "раньше"} на ${Math.abs(data.bedtime.average_deviation_minutes)} мин`}
          </p>
        </Card>
      </div>

      <Card title="Сон → самочувствие в зале">
        {data.vs_wellbeing.length > 1 ? (
          <>
            <SleepVsWellbeingChart points={data.vs_wellbeing} />
            <p className="tiny">
              Две шкалы на одних осях: слева часы сна перед тренировкой,
              справа оценка самочувствия после неё.
            </p>
          </>
        ) : (
          <Empty>
            График появится, когда накопится несколько тренировок с оценкой самочувствия.
          </Empty>
        )}
      </Card>
    </>
  );
}
