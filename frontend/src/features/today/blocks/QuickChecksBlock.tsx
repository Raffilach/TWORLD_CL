import { useState } from "react";

import { api } from "../../../shared/api/client";
import { submitOrQueue } from "../../../shared/offline/submit";
import { useList } from "../../../shared/api/hooks";
import type { TodayPayload } from "../../../shared/api/types";
import { haptic } from "../../../shared/hooks/useHaptics";
import { useUndo } from "../../../shared/hooks/useUndo";
import { Card, Chip, Progress } from "../../../shared/ui/primitives";
import { Sheet } from "../../../shared/ui/Sheet";

interface FoodItem {
  id: number;
  name: string;
  protein_g: string;
  serving_label: string;
}

/**
 * Добавки, вода и белок — по одному тапу на действие.
 *
 * Вода: тап по кружку или по «+». Белок: тап по частому продукту.
 * Ни одной формы и ни одной кнопки «Сохранить».
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
  const { data: quick } = useList<FoodItem>(["foods", "quick"], "/nutrition/foods/", {
    is_quick_button: "true",
    page_size: 12,
  });

  const glasses = Math.max(1, Math.round(data.water_target_ml / data.water_glass_ml));
  const filled = Math.floor(data.water_done_ml / data.water_glass_ml);

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
    <Card title="Отметки за день">
      <div className="stack">
        {data.supplements.length > 0 && (
          <div>
            <p className="muted">Добавки</p>
            <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
              {data.supplements.map((supplement) => (
                <Chip
                  key={supplement.id}
                  pressed={supplement.taken}
                  onClick={() => void toggleSupplement(supplement.id)}
                >
                  {supplement.taken ? "✓ " : ""}
                  {supplement.name}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="row row--between">
            <span className="muted">Вода</span>
            <span className="muted">
              {data.water_done_ml} / {data.water_target_ml} мл
            </span>
          </div>
          <div className="dots" style={{ marginTop: "var(--space-2)" }}>
            {Array.from({ length: glasses }, (_, index) => (
              <button
                key={index}
                type="button"
                className={`dot ${index < filled ? "dot--filled" : ""}`}
                aria-label={`Стакан ${index + 1} из ${glasses}`}
                onClick={() => void addGlass()}
              />
            ))}
            <button type="button" className="dot" aria-label="Добавить стакан" onClick={() => void addGlass()}>
              +
            </button>
          </div>
        </div>

        <div>
          <div className="row row--between">
            <span className="muted">Белок</span>
            <span className="muted">
              {Math.round(data.protein_done_g)} / {data.protein_target_g} г
            </span>
          </div>
          <div style={{ marginTop: "var(--space-2)" }}>
            <Progress value={data.protein_done_g} max={data.protein_target_g} />
          </div>
          <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
            {(quick ?? []).slice(0, 4).map((food) => (
              <Chip key={food.id} small onClick={() => void addProtein(food)}>
                {food.name.split(",")[0]} · {Number(food.protein_g).toFixed(0)} г
              </Chip>
            ))}
            <Chip small onClick={() => setFoodsOpen(true)} aria-label="Больше продуктов">
              ＋
            </Chip>
          </div>
        </div>
      </div>

      <Sheet open={foodsOpen} onClose={() => setFoodsOpen(false)} title="Белок в один тап">
        <div className="list">
          {(quick ?? []).map((food) => (
            <button
              key={food.id}
              type="button"
              className="list__item"
              onClick={() => void addProtein(food)}
            >
              <span className="grow">{food.name}</span>
              <span className="mono">{Number(food.protein_g).toFixed(0)} г</span>
            </button>
          ))}
        </div>
      </Sheet>
    </Card>
  );
}
