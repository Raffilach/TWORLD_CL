import { useState } from "react";

import { api } from "../../../shared/api/client";
import { submitOrQueue } from "../../../shared/offline/submit";
import type { TodayPayload } from "../../../shared/api/types";
import { haptic } from "../../../shared/hooks/useHaptics";
import { useUndo } from "../../../shared/hooks/useUndo";
import { Icon } from "../../../shared/ui/icons";
import { KeypadSheet } from "../../../shared/ui/Keypad";
import { Card, Chip, IconButton, IconTile, Notice } from "../../../shared/ui/primitives";

const CONDITIONS: { key: string; label: string }[] = [
  { key: "morning", label: "утро" },
  { key: "fasted", label: "натощак" },
  { key: "after_toilet", label: "после туалета" },
  { key: "undressed", label: "без одежды" },
];

/**
 * Вес за два тапа: «+» → цифры на своей клавиатуре → «Готово».
 *
 * Прошлое значение видно рядом с табло, а не заполняет его: иначе его
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
  const [open, setOpen] = useState(false);
  const [conditions, setConditions] = useState<Record<string, boolean>>(
    data.conditions_default ?? { morning: true, fasted: true },
  );
  const [warning, setWarning] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const save = async (value: string) => {
    const weight = Number(value);
    if (!Number.isFinite(weight) || weight <= 0) return;
    setOpen(false);
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
  const raw = data.raw_kg ? Number(data.raw_kg).toFixed(1) : null;
  // Тренда ещё нет (одно-два взвешивания) — показываем само значение.
  const shown = trend ?? raw;
  const change =
    data.change_7d !== null && data.change_7d !== undefined && Number.isFinite(Number(data.change_7d))
      ? Number(data.change_7d)
      : null;
  const previous = data.placeholder_kg ? Number(data.placeholder_kg).toFixed(1) : null;

  return (
    <Card>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <button
          type="button"
          className="grow"
          style={{ textAlign: "left" }}
          onClick={() => setOpen(true)}
          aria-label="Записать вес утром"
        >
          <span className="row" style={{ gap: "var(--space-2)" }}>
            <IconTile icon="scale" tone="blue" size="sm" />
            <span className="strong">Вес утром</span>
          </span>
          <span className="row" style={{ alignItems: "baseline", marginTop: "var(--space-2)", gap: "var(--space-3)" }}>
            <span className="hero-number">
              {shown ?? "—"}
              <span className="unit"> кг</span>
            </span>
            {change !== null && (
              <span className="delta" style={{ color: "var(--color-accent)" }}>
                <Icon name={change > 0 ? "trendUp" : "trendDown"} size={14} strokeWidth={2.4} />
                {change > 0 ? "+" : ""}
                {change.toFixed(1)}
                <span className="tiny" style={{ marginLeft: 2 }}>
                  за неделю
                </span>
              </span>
            )}
          </span>
          <span className="tiny" style={{ display: "block", marginTop: 2 }}>
            {trend
              ? `тренд за 7 дней${data.raw_kg ? ` · последнее ${Number(data.raw_kg).toFixed(1)} кг` : ""}`
              : "Тренд появится после нескольких взвешиваний"}
          </span>
        </button>
        <IconButton icon="plus" label="Добавить вес" variant="primary" onClick={() => setOpen(true)} />
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

      <KeypadSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Вес, кг"
        unit="кг"
        hint={previous ? `Прошлый раз: ${previous}` : undefined}
        onSubmit={(value) => void save(value)}
      >
        <div className="row row--wrap" style={{ marginBottom: "var(--space-3)" }}>
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
      </KeypadSheet>
    </Card>
  );
}
