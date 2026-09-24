import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import type { Habit } from "../../shared/api/types";
import { Button, Chip, Scale } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

interface Trigger {
  id: number;
  code: string;
  name_ru: string;
}

/**
 * Журнал тяги.
 *
 * Записывается в момент, когда тяга есть, поэтому форма короткая:
 * сила, триггер, что помогло. Из этих записей строится карта
 * закономерностей и определяется персональное рисковое время.
 */
export function CravingSheet({
  open,
  onClose,
  onSaved,
  habits,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  habits: Habit[];
}) {
  const { data: triggers } = useList<Trigger>(["craving-triggers"], "/catalog/craving-triggers/");
  const [habitId, setHabitId] = useState<number | null>(habits[0]?.id ?? null);
  const [intensity, setIntensity] = useState<number | null>(5);
  const [trigger, setTrigger] = useState<number | null>(null);
  const [helped, setHelped] = useState("");
  const [resisted, setResisted] = useState(true);

  const save = async () => {
    await api.post("/cravings/", {
      habit: habitId,
      occurred_at: new Date().toISOString(),
      intensity_1_10: intensity ?? 5,
      trigger,
      what_helped: helped,
      resisted,
    });
    setHelped("");
    setTrigger(null);
    onSaved();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Отметить тягу">
      <div className="stack">
        {habits.length > 1 && (
          <div className="row row--wrap">
            {habits.map((habit) => (
              <Chip
                key={habit.id}
                small
                pressed={habitId === habit.id}
                onClick={() => setHabitId(habit.id)}
              >
                {habit.name}
              </Chip>
            ))}
          </div>
        )}

        <Scale label="Насколько сильная" max={10} value={intensity} onChange={setIntensity} />

        <div>
          <span className="field__label">Что спровоцировало</span>
          <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
            {(triggers ?? []).map((item) => (
              <Chip
                key={item.id}
                small
                pressed={trigger === item.id}
                onClick={() => setTrigger(trigger === item.id ? null : item.id)}
              >
                {item.name_ru}
              </Chip>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field__label">Что помогло</span>
          <input
            value={helped}
            placeholder="Стакан воды, вышел на улицу"
            onChange={(event) => setHelped(event.target.value)}
          />
        </label>

        <div className="row row--wrap">
          <Chip pressed={resisted} onClick={() => setResisted(true)}>
            Удержался
          </Chip>
          <Chip pressed={!resisted} onClick={() => setResisted(false)}>
            Не удержался
          </Chip>
        </div>

        <Button variant="primary" size="lg" onClick={() => void save()}>
          Записать
        </Button>
      </div>
    </Sheet>
  );
}
