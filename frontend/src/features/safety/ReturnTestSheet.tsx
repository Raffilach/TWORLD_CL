import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import type { Exercise } from "../../shared/api/types";
import { Button, Notice } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

/**
 * Тест возврата к упражнению после травмы.
 *
 * Один вопрос вместо анкеты: болит ли при движении без веса. Если болит —
 * упражнение остаётся закрытым, и это решение принимает не пользователь
 * в моменте, а правило, заданное на холодную голову.
 */
export function ReturnTestSheet({
  open,
  injuryId,
  onClose,
  onSaved,
}: {
  open: boolean;
  injuryId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [result, setResult] = useState<{ unlocked: boolean; message: string } | null>(null);

  const { data: exercises } = useList<Exercise>(
    ["exercises", "return-test", search],
    "/exercises/",
    { search, page_size: 8 },
    search.length > 1,
  );

  const answer = async (pain: boolean) => {
    if (!exercise || injuryId === null) return;
    const created = await api.post<{ unlocked: boolean; message: string }>("/return-tests/", {
      injury: injuryId,
      exercise: exercise.id,
      date: new Date().toISOString().slice(0, 10),
      pain_without_weight: pain,
    });
    setResult(created);
    onSaved();
  };

  const close = () => {
    setResult(null);
    setExercise(null);
    setSearch("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Тест возврата">
      {result ? (
        <div className="stack">
          <Notice tone={result.unlocked ? "info" : "warn"}>{result.message}</Notice>
          <Button variant="primary" size="lg" onClick={close}>
            Понятно
          </Button>
        </div>
      ) : exercise ? (
        <div className="stack">
          <p className="big-number">{exercise.name}</p>
          <p>Болит при этом движении без веса?</p>
          <Button size="lg" onClick={() => void answer(true)}>
            Да, болит
          </Button>
          <Button variant="primary" size="lg" onClick={() => void answer(false)}>
            Нет, не болит
          </Button>
        </div>
      ) : (
        <div className="stack">
          <label className="field">
            <span className="field__label">Какое упражнение проверяем</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
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
        </div>
      )}
    </Sheet>
  );
}
