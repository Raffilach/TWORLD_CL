import { useState } from "react";
import type { ReactNode } from "react";

import { api } from "../../../shared/api/client";
import { submitOrQueue } from "../../../shared/offline/submit";
import { useList } from "../../../shared/api/hooks";
import type { TodayPayload } from "../../../shared/api/types";
import { haptic } from "../../../shared/hooks/useHaptics";
import { useUndo } from "../../../shared/hooks/useUndo";
import { Icon } from "../../../shared/ui/icons";
import type { IconName } from "../../../shared/ui/icons";
import { Card, IconButton, IconTile, Progress } from "../../../shared/ui/primitives";
import type { Tone } from "../../../shared/ui/primitives";
import { Sheet } from "../../../shared/ui/Sheet";

interface FoodItem {
  id: number;
  name: string;
  protein_g: string;
  serving_label: string;
}

/**
 * Вода, белок и добавки — по строке на каждое, с полосой до цели.
 *
 * Вода: «+» = стакан, сразу. Белок и добавки: «+» открывает короткий
 * список, где выбор — ещё один тап. Ни одной формы и ни одной кнопки
 * «Сохранить».
 */
export function QuickChecksBlock({
  data,
  onChanged,
}: {
  data: TodayPayload["nutrition"];
  onChanged: () => void;
}) {
  const undo = useUndo();
  const [foodsOpen, setFoodsOpen] = useState(false);
  const [supplementsOpen, setSupplementsOpen] = useState(false);
  const { data: quick } = useList<FoodItem>(["foods", "quick"], "/nutrition/foods/", {
    is_quick_button: "true",
    page_size: 12,
  });

  const glasses = Math.max(1, Math.round(data.water_target_ml / data.water_glass_ml));
  const filled = Math.floor(data.water_done_ml / data.water_glass_ml);
  const taken = data.supplements.filter((item) => item.taken).length;

  const addGlass = async () => {
    haptic("tap");
    if (!navigator.onLine) {
      // Без сети пишем напрямую в очередь: стакан воды не повод ждать связи.
      await submitOrQueue("water_log", "/nutrition/water/", {
        at: new Date().toISOString(),
        volume_ml: data.water_glass_ml,
      });
      undo.notify("+1 стакан записан без сети");
      return;
    }
    const response = await api.post<{ entry: { id: number } }>("/nutrition/water/glass/", {});
    onChanged();
    undo.push("+1 стакан", async () => {
      await api.delete(`/nutrition/water/${response.entry.id}/`);
      onChanged();
    });
  };

  const toggleSupplement = async (id: number) => {
    haptic("tap");
    await api.post(`/nutrition/supplements/${id}/toggle/`, {});
    onChanged();
  };

  const addProtein = async (food: FoodItem) => {
    haptic("success");
    const entry = await api.post<{ id: number; protein_g: string }>(
      "/nutrition/meals/quick-protein/",
      { food_item: food.id },
    );
    setFoodsOpen(false);
    onChanged();
    undo.push(`${food.name}: +${Number(entry.protein_g).toFixed(0)} г белка`, async () => {
      await api.delete(`/nutrition/meals/${entry.id}/`);
      onChanged();
    });
  };

  return (
    <Card className="card--tight">
      <Metric
        icon="water"
        tone="sky"
        label="Вода"
        value={filled}
        max={glasses}
        valueLabel={
          <>
            {filled} <small>/ {glasses}</small>
          </>
        }
        addLabel={`Добавить стакан воды (${data.water_done_ml} из ${data.water_target_ml} мл)`}
        onAdd={() => void addGlass()}
      />
      <Metric
        icon="protein"
        tone="green"
        label="Белок"
        value={data.protein_done_g}
        max={data.protein_target_g}
        valueLabel={
          <>
            {Math.round(data.protein_done_g)} <small>/ {data.protein_target_g} г</small>
          </>
        }
        addLabel="Добавить белок"
        onAdd={() => setFoodsOpen(true)}
      />
      {data.supplements.length > 0 && (
        <Metric
          icon="pill"
          tone="yellow"
          label="Добавки"
          value={taken}
          max={data.supplements.length}
          valueLabel={
            <>
              {taken} <small>/ {data.supplements.length}</small>
            </>
          }
          addLabel="Отметить добавки"
          onAdd={() => setSupplementsOpen(true)}
        />
      )}

      <Sheet open={foodsOpen} onClose={() => setFoodsOpen(false)} title="Белок в один тап">
        <div className="list">
          {(quick ?? []).map((food) => (
            <button
              key={food.id}
              type="button"
              className="list__item"
              onClick={() => void addProtein(food)}
            >
              <span className="grow">
                {food.name}
                <br />
                <span className="tiny">
                  {food.serving_label} · {Number(food.protein_g).toFixed(0)} г белка
                </span>
              </span>
              <span className="icon-btn icon-btn--soft" aria-hidden="true">
                <Icon name="plus" size={18} strokeWidth={2.2} />
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={supplementsOpen} onClose={() => setSupplementsOpen(false)} title="Добавки сегодня">
        <div className="list">
          {data.supplements.map((supplement) => (
            <button
              key={supplement.id}
              type="button"
              className="list__item"
              aria-pressed={supplement.taken}
              onClick={() => void toggleSupplement(supplement.id)}
            >
              <span className="grow">{supplement.name}</span>
              <span
                className={`status-dot ${supplement.taken ? "status-dot--done" : ""}`}
                aria-hidden="true"
              >
                {supplement.taken && <Icon name="check" size={12} strokeWidth={3} />}
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </Card>
  );
}

function Metric({
  icon,
  tone,
  label,
  value,
  max,
  valueLabel,
  hint,
  addLabel,
  onAdd,
}: {
  icon: IconName;
  tone: Tone;
  label: string;
  value: number;
  max: number;
  valueLabel: ReactNode;
  hint?: string;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="metric">
      <IconTile icon={icon} tone={tone} />
      <div className="metric__body">
        <div className="metric__top">
          <span className="metric__label">
            {label}
            {hint && <span className="tiny"> · {hint}</span>}
          </span>
          <span className="metric__value">{valueLabel}</span>
        </div>
        <Progress value={value} max={max} tone={tone} />
      </div>
      <IconButton icon="plus" label={addLabel} size="sm" onClick={onAdd} />
    </div>
  );
}
