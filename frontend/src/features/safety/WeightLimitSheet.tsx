import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import type { Exercise } from "../../shared/api/types";
import { Button, Notice } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

/**
 * Персональный лимит веса.
 *
 * Причина — обязательное поле: без неё напоминание в зале бесполезно.
 * «Скручивания не выше 63 кг» само по себе через месяц ничего не объясняет,
 * а «— спина» объясняет.
 */
export function WeightLimitSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [weight, setWeight] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: exercises } = useList<Exercise>(
    ["exercises", "limit-search", search],
    "/exercises/",
    { search, page_size: 8 },
    search.length > 1,
  );

  const save = async () => {
    setError(null);
    if (!exercise || !weight || !reason.trim()) {
      setError("Нужны упражнение, вес и причина.");
      return;
    }
    await api.post("/weight-limits/", {
      exercise: exercise.id,
      max_weight_kg: weight.replace(",", "."),
      reason,
    });
    setExercise(null);
    setSearch("");
    setWeight("");
    setReason("");
    onSaved();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Лимит веса">
      <div className="stack">
        {exercise ? (
          <div className="row row--between">
            <strong>{exercise.name}</strong>
            <button type="button" className="chip chip--sm" onClick={() => setExercise(null)}>
              изменить
            </button>
          </div>
        ) : (
          <>
            <label className="field">
              <span className="field__label">Упражнение</span>
              <input
                type="search"
                value={search}
                placeholder="Начни вводить название"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="list">
              {(exercises ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="list__item"
                  onClick={() => setExercise(item)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="field">
          <span className="field__label">Не выше, кг</span>
          <input
            inputMode="decimal"
            value={weight}
            placeholder="63.5"
            onChange={(event) => setWeight(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">Причина</span>
          <input
            value={reason}
            placeholder="Спина — на большем прострелило поясницу"
            onChange={(event) => setReason(event.target.value)}
          />
          <span className="field__hint">
            Её покажут в момент подхода — там про лимит никто не помнит.
          </span>
        </label>

        {error && <Notice>{error}</Notice>}

        <Button variant="primary" size="lg" onClick={() => void save()}>
          Сохранить
        </Button>
      </div>
    </Sheet>
  );
}
