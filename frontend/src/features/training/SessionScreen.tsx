import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../../shared/api/client";
import type { BlockPriority, SessionExercise, WorkoutSession } from "../../shared/api/types";
import { haptic } from "../../shared/hooks/useHaptics";
import { useSyncStatus } from "../../shared/hooks/useOnline";
import { useUndo } from "../../shared/hooks/useUndo";
import { Button, Loading, Notice, Scale, StatusDot } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";
import { RestTimer, SessionClock } from "../../shared/ui/timers";
import { ExercisePanel } from "./ExercisePanel";

const BLOCK_TITLES: Record<BlockPriority, string> = {
  required: "Обязательный",
  main: "Основной",
  optional: "По остатку сил",
};

interface RestState {
  seconds: number;
  startedAt: number;
}

/**
 * Активная тренировка — второй по важности экран после «Сегодня».
 *
 * План уже открыт, предзаполнен прошлыми значениями; основные действия
 * в нижней трети; всё пишется сразу, без кнопки «Сохранить».
 */
export function SessionScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const undo = useUndo();
  const { online, pending } = useSyncStatus();
  const [openExercise, setOpenExercise] = useState<number | null>(null);
  const [rest, setRest] = useState<RestState | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [wellbeing, setWellbeing] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const { data: session, refetch, isLoading } = useQuery({
    queryKey: ["workout", id],
    queryFn: () => api.get<WorkoutSession>(`/workouts/${id}/`),
    refetchOnMount: true,
  });

  // Первое незакрытое упражнение раскрывается само — меньше тапов.
  useEffect(() => {
    if (!session || openExercise !== null) return;
    const next = session.exercises.find((item) => item.status === "pending");
    if (next) setOpenExercise(next.id);
  }, [session, openExercise]);

  const grouped = useMemo(() => {
    const groups: Record<BlockPriority, SessionExercise[]> = {
      required: [],
      main: [],
      optional: [],
    };
    session?.exercises.forEach((item) => groups[item.block_priority]?.push(item));
    return groups;
  }, [session]);

  if (isLoading || !session) return <Loading />;

  const refresh = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["today"] });
  };

  const startRest = (seconds: number) => setRest({ seconds, startedAt: Date.now() });

  const finish = async () => {
    haptic("success");
    await api.post(`/workouts/${session.id}/finish/`, {
      wellbeing_1_10: wellbeing,
      notes,
    });
    void queryClient.invalidateQueries({ queryKey: ["today"] });
    void queryClient.invalidateQueries({ queryKey: ["active-session"] });
    navigate("/");
  };

  const required = session.completion.blocks.required;

  return (
    <div className="app app--fullscreen">
      <div className="grow">
        <header className="app__header">
          <button type="button" className="btn btn--ghost" onClick={() => navigate(-1)} aria-label="Назад">
            ←
          </button>
          <div className="grow">
            <strong>{session.template_name ?? "Тренировка"}</strong>{" "}
            <SessionClock startedAt={session.started_at} />
            <br />
            {/* Статус нужен именно здесь: в зале связи может не быть,
                и человек должен видеть, что подходы не потерялись. */}
            <span className="sync-status">
              {!online
                ? `Оффлайн · ${pending} в очереди`
                : pending > 0
                  ? `${pending} ждут отправки`
                  : "Синхронизировано"}
            </span>
          </div>
          <Button onClick={() => setFinishing(true)}>Завершить</Button>
        </header>

        <main className="app__main app-scroll">
          {required && (
            <p className="muted">
              Обязательный блок: {required.done} из {required.total}
              {session.completion.required_done && " — день засчитан"}
            </p>
          )}

          {(Object.keys(BLOCK_TITLES) as BlockPriority[]).map((priority) =>
            grouped[priority].length === 0 ? null : (
              <section key={priority}>
                <h2 className="block-header">
                  <span>{BLOCK_TITLES[priority]}</span>
                  <span>
                    {grouped[priority].filter((item) => item.status === "done").length} /{" "}
                    {grouped[priority].length}
                  </span>
                </h2>
                {grouped[priority].map((entry) => (
                  <ExercisePanel
                    key={entry.id}
                    entry={entry}
                    session={session}
                    open={openExercise === entry.id}
                    onToggle={() => setOpenExercise(openExercise === entry.id ? null : entry.id)}
                    onChanged={refresh}
                    onRest={startRest}
                    onUndo={undo.push}
                  />
                ))}
              </section>
            ),
          )}

          <p className="tiny" style={{ marginTop: "var(--space-5)" }}>
            Тоннаж {Number(session.tonnage_kg).toFixed(0)} кг · рабочих подходов{" "}
            {session.working_sets_count}. Разминочные в тоннаж не идут.
          </p>
        </main>

        {rest && (
          <RestTimer
            seconds={rest.seconds}
            startedAt={rest.startedAt}
            onAdd={(extra) => setRest({ ...rest, seconds: rest.seconds + extra })}
            onSkip={() => setRest(null)}
          />
        )}
      </div>

      <Sheet open={finishing} onClose={() => setFinishing(false)} title="Завершить тренировку">
        <Scale
          label="Самочувствие после тренировки (1–10)"
          max={10}
          value={wellbeing}
          onChange={setWellbeing}
        />
        <label className="field" style={{ marginTop: "var(--space-4)" }}>
          <span className="field__label">Заметка (необязательно)</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Например: болело плечо на жиме"
          />
        </label>
        {!session.completion.required_done && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <Notice tone="info">
              Обязательный блок не закрыт полностью. Это нормально — тренировка
              всё равно сохранится, а пропуски с причиной не портят статистику.
            </Notice>
          </div>
        )}
        <div style={{ marginTop: "var(--space-4)" }}>
          <Button variant="primary" size="lg" onClick={() => void finish()}>
            Завершить
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

export { StatusDot };
