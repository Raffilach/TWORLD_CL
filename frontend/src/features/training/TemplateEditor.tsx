import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import type { Exercise, TemplateBlock, WorkoutTemplate } from "../../shared/api/types";
import { Button, Chip, Notice } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/** Создание программы: три блока по приоритету заводятся сразу. */
export function CreateTemplateSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (template: WorkoutTemplate) => void;
}) {
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("75");
  const [days, setDays] = useState<number[]>([]);

  const create = async () => {
    if (!name.trim()) return;
    const template = await api.post<WorkoutTemplate>("/templates/", {
      name,
      duration_limit_minutes: limit ? Number(limit) : null,
    });
    const blocks: [string, string, number][] = [
      ["Обязательный", "required", 0],
      ["Основной", "main", 1],
      ["По остатку сил", "optional", 2],
    ];
    for (const [blockName, priority, order] of blocks) {
      await api.post("/template-blocks/", {
        template: template.id,
        name: blockName,
        priority,
        order,
      });
    }
    for (const weekday of days) {
      await api.post("/template-schedules/", { template: template.id, weekday });
    }
    const full = await api.get<WorkoutTemplate>(`/templates/${template.id}/`);
    setName("");
    setDays([]);
    onCreated(full);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Новая программа">
      <div className="stack">
        <label className="field">
          <span className="field__label">Название</span>
          <input value={name} placeholder="Верх тела" onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field">
          <span className="field__label">Лимит длительности, мин</span>
          <input
            inputMode="numeric"
            value={limit}
            onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))}
          />
          <span className="field__hint">
            Приложение прикинет длительность по числу подходов и отдыху
            и предупредит, если программа не влезает.
          </span>
        </label>

        <div>
          <span className="field__label">Дни недели</span>
          <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
            {WEEKDAYS.map((label, index) => (
              <Chip
                key={label}
                small
                pressed={days.includes(index)}
                onClick={() =>
                  setDays(
                    days.includes(index) ? days.filter((d) => d !== index) : [...days, index],
                  )
                }
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>

        <Notice tone="info">
          Блоки создадутся сразу: обязательный, основной и «по остатку сил».
          Обязательный держи коротким — именно его можно закрыть в плохой день.
        </Notice>

        <Button variant="primary" size="lg" onClick={() => void create()}>
          Создать
        </Button>
      </div>
    </Sheet>
  );
}

/** Добавление упражнения в блок с целевыми подходами и повторами. */
export function AddExerciseSheet({
  open,
  block,
  onClose,
  onAdded,
}: {
  open: boolean;
  block: TemplateBlock | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [sets, setSets] = useState("3");
  const [repsMin, setRepsMin] = useState("8");
  const [repsMax, setRepsMax] = useState("12");
  const [seconds, setSeconds] = useState("60");
  const [weight, setWeight] = useState("");

  const { data: exercises } = useList<Exercise>(
    ["exercises", "template-search", search],
    "/exercises/",
    { search, page_size: 10 },
    search.length > 1,
  );

  const isTimed = exercise?.load_type === "time";

  const add = async () => {
    if (!exercise || !block) return;
    await api.post("/template-exercises/", {
      block: block.id,
      exercise: exercise.id,
      order: block.exercises.length,
      target_sets: Number(sets) || 3,
      target_reps_min: isTimed ? null : Number(repsMin) || null,
      target_reps_max: isTimed ? null : Number(repsMax) || null,
      target_seconds: isTimed ? Number(seconds) || null : null,
      target_weight_kg: weight ? weight.replace(",", ".") : null,
    });
    setExercise(null);
    setSearch("");
    setWeight("");
    onAdded();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Упражнение в блок «${block?.name ?? ""}»`}>
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
              <span className="field__label">Поиск</span>
              <input
                type="search"
                value={search}
                placeholder="Жим лёжа"
                onChange={(e) => setSearch(e.target.value)}
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
                  <span className="grow">{item.name}</span>
                  {item.is_unilateral && <span className="tiny">на одну сторону</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {exercise && (
          <>
            <label className="field">
              <span className="field__label">Подходы</span>
              <input
                inputMode="numeric"
                value={sets}
                onChange={(e) => setSets(e.target.value.replace(/\D/g, ""))}
              />
            </label>

            {isTimed ? (
              <label className="field">
                <span className="field__label">Цель, секунд</span>
                <input
                  inputMode="numeric"
                  value={seconds}
                  onChange={(e) => setSeconds(e.target.value.replace(/\D/g, ""))}
                />
                <span className="field__hint">Только секунды: 90 — это полторы минуты.</span>
              </label>
            ) : (
              <div className="row" style={{ gap: "var(--space-3)" }}>
                <label className="field grow">
                  <span className="field__label">Повторы от</span>
                  <input
                    inputMode="numeric"
                    value={repsMin}
                    onChange={(e) => setRepsMin(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
                <label className="field grow">
                  <span className="field__label">до</span>
                  <input
                    inputMode="numeric"
                    value={repsMax}
                    onChange={(e) => setRepsMax(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
              </div>
            )}

            <label className="field">
              <span className="field__label">Рабочий вес, кг (необязательно)</span>
              <input
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value.replace(/[^\d.,]/g, ""))}
              />
            </label>

            <Button variant="primary" size="lg" onClick={() => void add()}>
              Добавить
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** «Сегодня НЕ делаем»: исключение с причиной, чтобы это читалось как решение. */
export function ExclusionSheet({
  open,
  templateId,
  onClose,
  onSaved,
}: {
  open: boolean;
  templateId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");

  const { data: exercises } = useList<Exercise>(
    ["exercises", "exclusion-search", search],
    "/exercises/",
    { search, page_size: 8 },
    search.length > 1,
  );

  const save = async () => {
    if (!exercise || !reason.trim()) return;
    await api.post("/planned-exclusions/", {
      exercise: exercise.id,
      template: templateId,
      date_from: new Date().toISOString().slice(0, 10),
      date_to: until || null,
      reason,
    });
    setExercise(null);
    setReason("");
    setSearch("");
    onSaved();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Сегодня не делаем">
      <div className="stack">
        <Notice tone="info">
          Исключение с причиной видно в плане — так это остаётся решением,
          а не выглядит забывчивостью.
        </Notice>

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
                onChange={(e) => setSearch(e.target.value)}
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
          <span className="field__label">Причина</span>
          <input
            value={reason}
            placeholder="Плечо, вернусь через две недели"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field__label">До какого числа (необязательно)</span>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>

        <Button variant="primary" size="lg" onClick={() => void save()}>
          Исключить
        </Button>
      </div>
    </Sheet>
  );
}
