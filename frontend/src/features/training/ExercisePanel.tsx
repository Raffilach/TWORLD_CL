import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import type { SessionExercise, SetLog, WorkoutSession } from "../../shared/api/types";
import { haptic } from "../../shared/hooks/useHaptics";
import { Button, Chip, Notice, StatusDot } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";
import { CountStepper, WeightStepper } from "../../shared/ui/Stepper";
import { SwipeRow } from "../../shared/ui/SwipeRow";
import { withPlural } from "../../shared/ui/plural";
import { secondsHint, Stopwatch } from "../../shared/ui/timers";

interface Prefill {
  weight_steps: number[];
  step_kg: string | null;
  last_weight_kg: string | null;
  last_reps: number | null;
  machine_number: string;
  seat_settings: string;
  last_session_date: string | null;
  last_sets: { weight_kg: string | null; reps: number | null; duration_seconds: number | null }[];
  limits: { max_weight_kg: string; reason: string }[];
  skip_streak: number;
}

interface FailReason {
  id: number;
  code: string;
  name_ru: string;
  counts_against_discipline: boolean;
}

/**
 * Одно упражнение внутри тренировки.
 *
 * Предзаполнение прошлыми значениями, шаг веса по сетке конкретного зала,
 * «как в прошлый раз» одним тапом и три состояния вместо двух.
 */
export function ExercisePanel({
  entry,
  session,
  open,
  onToggle,
  onChanged,
  onRest,
  onUndo,
}: {
  entry: SessionExercise;
  session: WorkoutSession;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
  onRest: (seconds: number) => void;
  onUndo: (message: string, undo: () => void | Promise<void>) => void;
}) {
  const [statusSheet, setStatusSheet] = useState(false);
  const [gridSheet, setGridSheet] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [isWarmup, setIsWarmup] = useState(false);
  const [rir, setRir] = useState<number | null>(null);
  const [manualSeconds, setManualSeconds] = useState("");

  const { data: prefill } = useQuery({
    queryKey: ["prefill", entry.exercise, session.gym],
    queryFn: () =>
      api.get<Prefill>(`/exercises/${entry.exercise}/prefill/`, { gym: session.gym ?? undefined }),
    enabled: open,
  });

  const { data: reasons } = useList<FailReason>(
    ["fail-reasons"],
    "/catalog/fail-reasons/",
    undefined,
    statusSheet,
  );

  const [weight, setWeight] = useState<number | null>(null);
  const [reps, setReps] = useState<number | null>(null);

  const currentWeight =
    weight ?? (prefill?.last_weight_kg ? Number(prefill.last_weight_kg) : null);
  const currentReps = reps ?? prefill?.last_reps ?? 10;

  const isTimed = entry.load_type === "time";
  const workingSets = entry.sets.filter((set) => !set.is_warmup);

  const recordSet = async (payload: Partial<SetLog>) => {
    haptic("success");
    const created = await api.post<SetLog & { warnings?: { message: string }[] }>("/sets/", {
      session_exercise: entry.id,
      set_number: entry.sets.length + 1,
      is_warmup: isWarmup,
      rir,
      ...payload,
    });
    setWarning(created.warnings?.[0]?.message ?? null);
    setRir(null);
    onChanged();
    // Таймер отдыха стартует сам — руками его никто не запускает.
    if (!isWarmup) onRest(prefillRest(entry, session));
    onUndo("Подход записан", async () => {
      await api.delete(`/sets/${created.id}/`);
      onChanged();
    });
  };

  const repeatLast = async () => {
    haptic("success");
    await api.post(`/session-exercises/${entry.id}/repeat_last/`, {});
    onChanged();
  };

  const mark = async (status: string, reasonCode?: string) => {
    await api.post(`/session-exercises/${entry.id}/mark/`, {
      status,
      fail_reason: reasonCode,
    });
    setStatusSheet(false);
    onChanged();
  };

  const deleteSet = async (setId: number) => {
    await api.delete(`/sets/${setId}/`);
    onChanged();
  };

  return (
    <article
      className={`exercise-item ${open ? "exercise-item--active" : ""} ${
        entry.status === "done" ? "exercise-item--done" : ""
      }`}
    >
      <button type="button" className="exercise-item__head" onClick={onToggle}>
        <StatusDot status={entry.status} />
        <span className="grow">
          <strong>{entry.exercise_name}</strong>
          {entry.is_unilateral && <span className="tiny"> · на одну сторону</span>}
          <br />
          <span className="tiny">
            {entry.status === "failed" && entry.fail_reason_code
              ? `не смог: ${entry.fail_reason_code}`
              : workingSets.length > 0
                ? workingSets
                    .map((set) =>
                      set.duration_seconds !== null
                        ? `${set.duration_seconds} с`
                        : `${Number(set.weight_kg ?? 0)}×${set.reps ?? 0}`,
                    )
                    .join(", ")
                : "нет подходов"}
          </span>
        </span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="exercise-item__body stack">
          {prefill?.machine_number && (
            <p className="tiny">
              Тренажёр {prefill.machine_number}
              {prefill.seat_settings && ` · ${prefill.seat_settings}`}
            </p>
          )}

          {prefill?.skip_streak && prefill.skip_streak >= 3 ? (
            <Notice>
              Пропущено {prefill.skip_streak} раз подряд. Упражнения в конце тренировки
              теряются — попробуй поставить его раньше.
            </Notice>
          ) : null}

          {prefill?.limits.map((limit) => (
            <Notice key={limit.reason}>
              Личный лимит {Number(limit.max_weight_kg)} кг — {limit.reason}
            </Notice>
          ))}

          {entry.sets.length > 0 && (
            <ul className="list">
              {entry.sets.map((set) => (
                <li key={set.id}>
                  <SwipeRow onDelete={() => void deleteSet(set.id)}>
                    <div className={`set-row ${set.is_warmup ? "set-row--warmup" : ""}`}>
                      <span className="tiny">{set.is_warmup ? "разм." : `#${set.set_number}`}</span>
                      <span className="mono">
                        {set.duration_seconds !== null
                          ? `${set.duration_seconds} с${set.duration_label ? ` (${set.duration_label})` : ""}`
                          : `${Number(set.weight_kg ?? 0)}${set.weight_is_per_side ? "/стор." : ""} × ${set.reps ?? 0}`}
                        {set.rir !== null && <span className="tiny"> RIR {set.rir}</span>}
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--square"
                        aria-label="Удалить подход"
                        onClick={() => void deleteSet(set.id)}
                      >
                        ×
                      </button>
                    </div>
                  </SwipeRow>
                </li>
              ))}
            </ul>
          )}

          {isTimed ? (
            <>
              <Stopwatch onRecord={(seconds) => void recordSet({ duration_seconds: seconds })} />
              <label className="field">
                <span className="field__label">Или ввести вручную, в секундах</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={manualSeconds}
                  placeholder="85"
                  onChange={(event) => setManualSeconds(event.target.value.replace(/\D/g, ""))}
                />
                <span className="field__hint">
                  {secondsHint(manualSeconds) ?? "85 = 1:25. Только секунды, не время суток."}
                </span>
              </label>
              {manualSeconds && (
                <Button
                  variant="primary"
                  onClick={() => {
                    void recordSet({ duration_seconds: Number(manualSeconds) });
                    setManualSeconds("");
                  }}
                >
                  Записать {manualSeconds} с
                </Button>
              )}
            </>
          ) : (
            <>
              <div className="row" style={{ gap: "var(--space-3)" }}>
                <div className="grow">
                  <span className="field__label">Вес</span>
                  <WeightStepper
                    value={currentWeight}
                    steps={prefill?.weight_steps ?? []}
                    fallbackStep={prefill?.step_kg ? Number(prefill.step_kg) : 2.5}
                    onChange={setWeight}
                    onPickFromList={() => setGridSheet(true)}
                  />
                </div>
                <div style={{ width: "40%" }}>
                  <span className="field__label">Повторы</span>
                  <CountStepper
                    value={currentReps}
                    onChange={setReps}
                    min={1}
                    max={60}
                    label="Повторы"
                  />
                </div>
              </div>

              <div className="row row--wrap">
                <Chip small pressed={isWarmup} onClick={() => setIsWarmup(!isWarmup)}>
                  разминка
                </Chip>
                {[0, 1, 2, 3].map((value) => (
                  <Chip
                    key={value}
                    small
                    pressed={rir === value}
                    onClick={() => setRir(rir === value ? null : value)}
                  >
                    RIR {value}
                  </Chip>
                ))}
              </div>

              <div className="row" style={{ gap: "var(--space-2)" }}>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() =>
                    void recordSet({
                      weight_kg: currentWeight !== null ? String(currentWeight) : null,
                      reps: currentReps,
                      weight_is_per_side: entry.is_unilateral,
                    })
                  }
                >
                  ✓ Записать {currentWeight ?? "—"} × {currentReps}
                </Button>
              </div>

              {prefill?.last_sets && prefill.last_sets.length > 0 && (
                <Button onClick={() => void repeatLast()}>
                  Как в прошлый раз ({withPlural(prefill.last_sets.length, "подход", "подхода", "подходов")})
                </Button>
              )}
            </>
          )}

          {warning && <Notice>{warning}</Notice>}

          <div className="row row--wrap">
            <Chip small onClick={() => void mark("done")}>
              Сделано
            </Chip>
            <Chip small onClick={() => setStatusSheet(true)}>
              Пропустить / не смог
            </Chip>
          </div>

          {entry.alternatives && entry.alternatives.length > 0 && (
            <p className="tiny">
              Альтернативы: {entry.alternatives.map((item) => item.alternative_name).join(", ")}
            </p>
          )}
        </div>
      )}

      <Sheet open={gridSheet} onClose={() => setGridSheet(false)} title="Сетка весов этого зала">
        <div className="row row--wrap">
          {(prefill?.weight_steps ?? []).map((step) => (
            <Chip
              key={step}
              pressed={currentWeight === step}
              onClick={() => {
                setWeight(step);
                setGridSheet(false);
              }}
            >
              {step}
            </Chip>
          ))}
        </div>
        {(prefill?.weight_steps ?? []).length === 0 && (
          <p className="muted">
            Сетка не задана. Её можно указать в карточке упражнения — тогда
            кнопки +/− будут ходить по реальным значениям тренажёра.
          </p>
        )}
      </Sheet>

      <Sheet open={statusSheet} onClose={() => setStatusSheet(false)} title="Что произошло">
        <button type="button" className="list__item" onClick={() => void mark("skipped")}>
          <span className="grow">Пропускаю осознанно</span>
          <span className="tiny">не влияет на дисциплину</span>
        </button>
        {(reasons ?? []).map((reason) => (
          <button
            key={reason.id}
            type="button"
            className="list__item"
            onClick={() => void mark("failed", reason.code)}
          >
            <span className="grow">{reason.name_ru}</span>
            <span className="tiny">
              {reason.counts_against_discipline ? "учтётся" : "внешняя причина"}
            </span>
          </button>
        ))}
      </Sheet>
    </article>
  );
}

function prefillRest(entry: SessionExercise, session: WorkoutSession): number {
  // Пресет зависит от упражнения: изоляция короче, тяги и жимы дольше.
  const template = session.exercises.find((item) => item.id === entry.id);
  void template;
  return entry.load_type === "time" ? 60 : 90;
}
