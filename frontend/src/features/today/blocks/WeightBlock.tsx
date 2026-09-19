import { useState } from "react";

import { api } from "../../../shared/api/client";
import { submitOrQueue } from "../../../shared/offline/submit";
import type { TodayPayload } from "../../../shared/api/types";
import { haptic } from "../../../shared/hooks/useHaptics";
import { useUndo } from "../../../shared/hooks/useUndo";
import { NumberField } from "../../../shared/ui/NumberField";
import { Card, Chip, Notice } from "../../../shared/ui/primitives";

const CONDITIONS: { key: string; label: string }[] = [
  { key: "morning", label: "утро" },
  { key: "fasted", label: "натощак" },
  { key: "after_toilet", label: "после туалета" },
  { key: "undressed", label: "без одежды" },
];

/**
 * Вес за два тапа: тап по цифре → цифровая клавиатура → автосохранение.
 *
 * Прошлое значение стоит плейсхолдером, а не заполняет поле: иначе его
 * пришлось бы стирать. Крупно показывается тренд, сырое значение — мелко:
 * +1,7 кг за неделю по сырому весу это чаще вода, а не жир.
 */
export function WeightBlock({
  data,
  onChanged,
}: {
  data: TodayPayload["weight"];
  onChanged: () => void;
}) {
  const undo = useUndo();
  const [conditions, setConditions] = useState<Record<string, boolean>>(
    data.conditions_default ?? { morning: true, fasted: true },
  );
  const [warning, setWarning] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const save = async (value: string) => {
    const weight = Number(value);
    if (!Number.isFinite(weight) || weight <= 0) return;
    haptic("success");
    const result = await submitOrQueue<{
      id: number;
      fast_loss_warning: { message: string } | null;
      comparability_note: string | null;
    }>("weight_entry", "/body/weight/", {
      at: new Date().toISOString(),
      weight_kg: weight.toFixed(2),
      conditions,
    });

    if (result.queued) {
      setNote(null);
      setWarning(null);
      undo.notify(`${weight} кг записано без сети — отправим, когда появится`);
      return;
    }

    setWarning(result.data?.fast_loss_warning?.message ?? null);
    setNote(result.data?.comparability_note ?? null);
    onChanged();
    const createdId = result.data?.id;
    undo.push(`Записано ${weight} кг`, async () => {
      if (createdId) await api.delete(`/body/weight/${createdId}/`);
      onChanged();
    });
  };

  const trend = data.trend_kg ? Number(data.trend_kg).toFixed(1) : null;
  const change = data.change_7d !== null ? Number(data.change_7d) : null;

  return (
    <Card title="Вес утром">
      <NumberField
        value=""
        placeholder={data.placeholder_kg ? Number(data.placeholder_kg).toFixed(1) : "0,0"}
        suffix="кг"
        ariaLabel="Вес утром, килограммы"
        onCommit={save}
      />

      <p className="muted" style={{ textAlign: "center", marginTop: "var(--space-2)" }}>
        {trend ? (
          <>
            тренд <strong>{trend} кг</strong>
            {change !== null && (
              <> · {change > 0 ? "+" : ""}{change.toFixed(2)} за неделю</>
            )}
          </>
        ) : (
          "Тренд появится после нескольких взвешиваний"
        )}
      </p>
      {data.raw_kg && (
        <p className="tiny" style={{ textAlign: "center" }}>
          последнее значение {Number(data.raw_kg).toFixed(1)} кг
        </p>
      )}

      <div className="row row--wrap" style={{ marginTop: "var(--space-3)" }}>
        {CONDITIONS.map((condition) => (
          <Chip
            key={condition.key}
            small
            pressed={Boolean(conditions[condition.key])}
            onClick={() =>
              setConditions((prev) => ({ ...prev, [condition.key]: !prev[condition.key] }))
            }
          >
            {condition.label}
          </Chip>
        ))}
      </div>

      {note && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Notice tone="info">{note}</Notice>
        </div>
      )}
      {warning && (
        <div style={{ marginTop: "var(--space-2)" }}>
          <Notice>{warning}</Notice>
        </div>
      )}
    </Card>
  );
}
