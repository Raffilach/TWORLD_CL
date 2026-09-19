import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../shared/api/client";
import { Button, Card, Empty, Loading, Notice } from "../../shared/ui/primitives";
import { InjurySheet } from "../safety/InjurySheet";
import { WeightLimitSheet } from "../safety/WeightLimitSheet";

interface SafetyOverview {
  active_injuries: {
    id: number;
    body_part_name: string;
    side: string;
    started_on: string;
    initial_severity: number;
    notes: string;
  }[];
  recurrence_notices: { id: number; body_part_name: string; days_between: number; message: string }[];
  limits: { id: number; exercise_name: string | null; max_weight_kg: string; reason: string }[];
}

export function SafetyTab() {
  const [injuryOpen, setInjuryOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["safety"],
    queryFn: () => api.get<SafetyOverview>("/safety/"),
  });

  if (isLoading || !data) return <Loading />;

  return (
    <>
      <div className="row row--wrap" style={{ marginBottom: "var(--space-3)" }}>
        <Button variant="primary" onClick={() => setInjuryOpen(true)}>
          Отметить травму
        </Button>
        <Button onClick={() => setLimitOpen(true)}>Добавить лимит веса</Button>
      </div>

      {data.recurrence_notices.map((notice) => (
        <div key={notice.id} style={{ marginBottom: "var(--space-3)" }}>
          <Notice>{notice.message}</Notice>
        </div>
      ))}

      <Card title="Активные травмы">
        {data.active_injuries.length ? (
          <ul className="list">
            {data.active_injuries.map((injury) => (
              <li key={injury.id} className="list__item">
                <span className="grow">
                  {injury.body_part_name}
                  <br />
                  <span className="tiny">
                    с {injury.started_on} · интенсивность {injury.initial_severity}/10
                  </span>
                  {injury.notes && <span className="tiny"><br />{injury.notes}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Активных травм нет.</Empty>
        )}
      </Card>

      <Card title="Личные лимиты веса">
        {data.limits.length ? (
          <ul className="list">
            {data.limits.map((limit) => (
              <li key={limit.id} className="list__item">
                <span className="grow">
                  {limit.exercise_name ?? "движение"}
                  <br />
                  <span className="tiny">{limit.reason}</span>
                </span>
                <span className="mono">≤ {Number(limit.max_weight_kg)} кг</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Лимитов не задано.</Empty>
        )}
        <p className="tiny" style={{ marginTop: "var(--space-2)" }}>
          При вводе большего веса приложение напомнит о причине, но не заблокирует
          запись: решение остаётся за тобой.
        </p>
      </Card>

      <InjurySheet
        open={injuryOpen}
        onClose={() => setInjuryOpen(false)}
        onSaved={() => void refetch()}
      />
      <WeightLimitSheet
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
        onSaved={() => void refetch()}
      />
    </>
  );
}
