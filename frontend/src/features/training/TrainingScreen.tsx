import { useState } from "react";
import { Link } from "react-router-dom";

import { useList } from "../../shared/api/hooks";
import type { Exercise, Gym, WorkoutSession, WorkoutTemplate } from "../../shared/api/types";
import { Button, Card, Chip, Empty, Loading } from "../../shared/ui/primitives";
import { withPlural } from "../../shared/ui/plural";
import { formatClock } from "../../shared/ui/timers";

type Tab = "programs" | "library" | "history" | "gyms";

const TABS: { id: Tab; label: string }[] = [
  { id: "programs", label: "Программы" },
  { id: "library", label: "Библиотека" },
  { id: "history", label: "История" },
  { id: "gyms", label: "Залы" },
];

export function TrainingScreen() {
  const [tab, setTab] = useState<Tab>("programs");
  const [search, setSearch] = useState("");

  const templates = useList<WorkoutTemplate>(["templates"], "/templates/", undefined, tab === "programs");
  const exercises = useList<Exercise>(
    ["exercises", search],
    "/exercises/",
    { search, page_size: 60 },
    tab === "library",
  );
  const history = useList<WorkoutSession>(
    ["workouts", "history"],
    "/workouts/",
    { page_size: 40 },
    tab === "history",
  );
  const gyms = useList<Gym>(["gyms"], "/gyms/", undefined, tab === "gyms");

  return (
    <>
      <div className="row row--wrap" style={{ marginBottom: "var(--space-4)" }}>
        {TABS.map((item) => (
          <Chip key={item.id} small pressed={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </Chip>
        ))}
      </div>

      {tab === "programs" && (
        <>
          {templates.isLoading && <Loading />}
          {templates.data?.map((template) => (
            <Card key={template.id} title={template.name}>
              <p className="muted">
                ~{template.estimated_minutes} мин
                {template.duration_limit_minutes && ` из ${template.duration_limit_minutes}`}
                {template.over_limit && " · дольше лимита"}
              </p>
              <ul className="muted" style={{ marginTop: "var(--space-2)" }}>
                {template.blocks.map((block) => (
                  <li key={block.id}>
                    {block.priority_label}:{" "}
                    {withPlural(block.exercises.length, "упражнение", "упражнения", "упражнений")}
                  </li>
                ))}
              </ul>
              <div className="row" style={{ marginTop: "var(--space-3)" }}>
                <Link className="btn" to={`/training/templates/${template.id}`}>
                  Открыть
                </Link>
              </div>
            </Card>
          ))}
          {templates.data?.length === 0 && (
            <Empty>Программ пока нет. Их можно создать здесь или импортировать план от ИИ в профиле.</Empty>
          )}
        </>
      )}

      {tab === "library" && (
        <>
          <input
            type="search"
            placeholder="Поиск упражнения"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoCapitalize="off"
            style={{ marginBottom: "var(--space-3)" }}
          />
          {exercises.isLoading && <Loading />}
          <div className="list">
            {exercises.data?.map((exercise) => (
              <Link key={exercise.id} className="list__item" to={`/training/exercises/${exercise.id}`}>
                <span className="grow">
                  {exercise.name}
                  {exercise.is_unilateral && <span className="tiny"> · на одну сторону</span>}
                </span>
                <span className="tiny">{LOAD_LABELS[exercise.load_type]}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {tab === "history" && (
        <>
          {history.isLoading && <Loading />}
          <div className="list">
            {history.data?.map((session) => (
              <div key={session.id} className="list__item">
                <span className="grow">
                  {formatDate(session.date)} · {session.template_name ?? "без плана"}
                  <br />
                  <span className="tiny">
                    {Number(session.tonnage_kg).toFixed(0)} кг ·{" "}
                    {session.duration_seconds ? formatClock(session.duration_seconds) : "—"}
                    {session.is_training_while_injured && " · на больном"}
                  </span>
                </span>
                {session.wellbeing_1_10 && <span className="mono">{session.wellbeing_1_10}/10</span>}
              </div>
            ))}
          </div>
          {history.data?.length === 0 && <Empty>История появится после первой тренировки.</Empty>}
        </>
      )}

      {tab === "gyms" && (
        <>
          {gyms.isLoading && <Loading />}
          {gyms.data?.map((gym) => (
            <Card key={gym.id} title={gym.name}>
              <p className="muted">
                {GYM_KINDS[gym.kind]}
                {gym.is_default && " · основной"}
              </p>
              {gym.notes && <p className="muted">{gym.notes}</p>}
            </Card>
          ))}
          <p className="tiny">
            Веса хранятся отдельно для каждого зала: один и тот же тренажёр
            в разных залах даёт разные цифры на блоке.
          </p>
        </>
      )}
    </>
  );
}

const LOAD_LABELS: Record<string, string> = {
  weight_reps: "вес × повторы",
  time: "время",
  bodyweight_reps: "свой вес",
  distance: "дистанция",
};

const GYM_KINDS: Record<string, string> = {
  work: "рабочий",
  home: "домашний",
  travel: "в поездке",
  other: "другой",
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export { Button };
