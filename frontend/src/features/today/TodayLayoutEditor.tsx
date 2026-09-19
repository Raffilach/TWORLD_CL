import { useEffect, useState } from "react";

import type { TodayBlock } from "../../shared/api/types";
import { useAuth } from "../../app/auth";
import { Button } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

const LABELS: Record<string, string> = {
  weight: "Вес утром",
  workout: "Тренировка сегодня",
  quick_checks: "Добавки, вода, белок",
  habits: "Счётчики привычек",
  sleep: "Сон за прошлую ночь",
  mood_energy: "Настроение и энергия",
  evening_plan: "Во сколько выйти из зала",
  day_progress: "Прогресс дня",
  journal_quick: "Быстрая запись в дневник",
  measurements_due: "Замеры по расписанию",
  photo_due: "Прогресс-фото по расписанию",
};

/**
 * Состав и порядок блоков настраивает сам пользователь.
 * Ненужное скрывается и больше не занимает место на главном экране.
 */
export function TodayLayoutEditor({
  open,
  layout,
  onClose,
}: {
  open: boolean;
  layout: TodayBlock[];
  onClose: () => void;
}) {
  const { patchSettings } = useAuth();
  const [items, setItems] = useState<TodayBlock[]>(layout);

  useEffect(() => setItems(layout), [layout]);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next.map((item, position) => ({ ...item, order: position })));
  };

  const save = async () => {
    await patchSettings({
      today_blocks: items.map((item, position) => ({ ...item, order: position })),
    });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Что показывать на главном экране">
      <ul className="list">
        {items.map((item, index) => (
          <li key={item.block_id} className="list__item">
            <label className="row grow" style={{ gap: "var(--space-3)" }}>
              <input
                type="checkbox"
                style={{ width: "auto", minHeight: "auto" }}
                checked={item.visible}
                onChange={() =>
                  setItems(
                    items.map((entry, position) =>
                      position === index ? { ...entry, visible: !entry.visible } : entry,
                    ),
                  )
                }
              />
              <span>{LABELS[item.block_id] ?? item.block_id}</span>
            </label>
            <button
              type="button"
              className="btn btn--square btn--ghost"
              aria-label="Выше"
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn--square btn--ghost"
              aria-label="Ниже"
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: "var(--space-4)" }}>
        <Button variant="primary" size="lg" onClick={() => void save()}>
          Готово
        </Button>
      </div>
    </Sheet>
  );
}
