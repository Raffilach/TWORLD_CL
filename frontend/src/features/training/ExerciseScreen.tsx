import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import type { Exercise, Gym, GymExerciseProfile } from "../../shared/api/types";
import { Button, Card, Chip, Empty, Loading, Notice } from "../../shared/ui/primitives";
import { SimpleLineChart } from "../../shared/ui/charts";
import { ExerciseMusclesCard } from "../musclemap/cards";

interface HistoryPoint {
  date: string;
  weight_kg: string | null;
  reps: number | null;
  duration_seconds: number | null;
}

interface HistoryResponse {
  points: HistoryPoint[];
  records: { id: number; kind_label: string; value: string; achieved_on: string }[];
}

/**
 * Карточка упражнения: история, рекорды, настройки по залам и альтернативы.
 *
 * Сетка весов хранится отдельно для каждого зала — это единственный способ
 * получить правильные кнопки +/− на блочном тренажёре.
 */
export function ExerciseScreen() {
  const { id } = useParams();
  const [gymId, setGymId] = useState<number | null>(null);
  const [steps, setSteps] = useState("");

  const { data: exercise, isLoading } = useQuery({
    queryKey: ["exercise", id],
    queryFn: () => api.get<Exercise>(`/exercises/${id}/`),
  });
  const { data: history } = useQuery({
    queryKey: ["exercise-history", id],
    queryFn: () => api.get<HistoryResponse>(`/exercises/${id}/history/`),
  });
  const { data: hints } = useQuery({
    queryKey: ["exercise-progression", id, gymId],
    queryFn: () =>
      api.get<{ hints: { kind: string; message: string }[] }>(`/exercises/${id}/progression/`, {
        gym: gymId ?? undefined,
      }),
  });
  const { data: gyms } = useList<Gym>(["gyms"], "/gyms/");
  const { data: profiles, refetch: refetchProfiles } = useList<GymExerciseProfile>(
    ["gym-profiles", id],
    "/gym-profiles/",
    { exercise: id },
  );

  if (isLoading || !exercise) return <Loading />;

  const activeProfile = profiles?.find((profile) => profile.gym === gymId) ?? profiles?.[0];

  const saveSteps = async () => {
    if (!gymId) return;
    const parsed = steps
      .split(/[,\s]+/)
      .map((value) => Number(value.replace(",", ".")))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (parsed.length === 0) return;
    if (activeProfile && activeProfile.gym === gymId) {
      await api.patch(`/gym-profiles/${activeProfile.id}/`, { weight_steps: parsed });
    } else {
      await api.post("/gym-profiles/", {
        gym: gymId,
        exercise: exercise.id,
        weight_steps: parsed,
      });
    }
    setSteps("");
    await refetchProfiles();
  };

  const chartData = (history?.points ?? []).map((point) => ({
    date: point.date,
    weight: point.weight_kg ? Number(point.weight_kg) : null,
    seconds: point.duration_seconds,
  }));

  return (
    <>
      <h2 style={{ marginBottom: "var(--space-2)" }}>{exercise.name}</h2>
      <p className="muted">
        {exercise.muscle_links.map((link) => link.muscle_name).join(", ")}
        {exercise.is_unilateral && " · вес на одну сторону"}
      </p>

      {hints?.hints.map((hint) => (
        <div key={hint.kind} style={{ margin: "var(--space-3) 0" }}>
          <Notice tone={hint.kind === "increase" ? "info" : "warn"}>{hint.message}</Notice>
        </div>
      ))}

      <ExerciseMusclesCard
        name={exercise.name}
        coarse={exercise.muscle_links.map((link) => ({ name: link.muscle_name, role: link.role }))}
      />

      <Card title="История">
        {chartData.length > 1 ? (
          <SimpleLineChart
            data={chartData}
            dataKey={exercise.load_type === "time" ? "seconds" : "weight"}
            name={exercise.load_type === "time" ? "секунды" : "кг"}
          />
        ) : (
          <Empty>Данных пока мало — график появится после нескольких тренировок.</Empty>
        )}
        {history?.records?.length ? (
          <ul className="list">
            {history.records.map((record) => (
              <li key={record.id} className="list__item">
                <span className="grow">{record.kind_label}</span>
                <span className="mono">{Number(record.value).toFixed(1)}</span>
                <span className="tiny">{record.achieved_on}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title="Настройки по залам">
        <div className="row row--wrap">
          {(gyms ?? []).map((gym) => (
            <Chip key={gym.id} small pressed={gymId === gym.id} onClick={() => setGymId(gym.id)}>
              {gym.name}
            </Chip>
          ))}
        </div>

        {activeProfile && (
          <div className="stack" style={{ marginTop: "var(--space-3)" }}>
            <p className="muted">
              Сетка: {activeProfile.weight_steps.length > 0 ? activeProfile.weight_steps.join(" · ") : "не задана"}
            </p>
            {activeProfile.machine_number && (
              <p className="muted">Тренажёр {activeProfile.machine_number}</p>
            )}
            {activeProfile.seat_settings && (
              <p className="muted">Настройки: {activeProfile.seat_settings}</p>
            )}
            {activeProfile.photo && (
              <img
                src={activeProfile.photo}
                alt="Фото настроек тренажёра"
                style={{ width: "100%", borderRadius: "var(--radius-md)" }}
              />
            )}
          </div>
        )}

        {gymId && (
          <label className="field" style={{ marginTop: "var(--space-3)" }}>
            <span className="field__label">Фактические значения тренажёра</span>
            <input
              inputMode="decimal"
              value={steps}
              placeholder="36.2 40.8 45.3 49.8 54.4 58.9"
              onChange={(event) => setSteps(event.target.value)}
            />
            <span className="field__hint">
              Кнопки +/− будут ходить по этим числам, а не прибавлять условные 2,5 кг.
            </span>
            <div style={{ marginTop: "var(--space-2)" }}>
              <Button onClick={() => void saveSteps()}>Сохранить сетку</Button>
            </div>
          </label>
        )}
      </Card>

      {exercise.alternatives.length > 0 && (
        <Card title="Если тренажёр занят">
          <ul className="list">
            {exercise.alternatives.map((alternative) => (
              <li key={alternative.id} className="list__item">
                {alternative.alternative_name}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
