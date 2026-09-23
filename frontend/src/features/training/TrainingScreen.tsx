import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useList } from "../../shared/api/hooks";
import type { Exercise, Gym, WorkoutSession, WorkoutTemplate } from "../../shared/api/types";
import { api } from "../../shared/api/client";
import { haptic } from "../../shared/hooks/useHaptics";
import { Icon } from "../../shared/ui/icons";
import {
  Button,
  Card,
  Empty,
  IconTile,
  ListRow,
  Loading,
  SectionTitle,
  Segmented,
} from "../../shared/ui/primitives";
import type { Tone } from "../../shared/ui/primitives";
import { withPlural } from "../../shared/ui/plural";
import { formatClock } from "../../shared/ui/timers";
import { CreateTemplateSheet } from "./TemplateEditor";

type Tab = "programs" | "library" | "history" | "gyms";

const TABS: { id: Tab; label: string }[] = [
  { id: "programs", label: "План" },
  { id: "library", label: "Упражнения" },
  { id: "history", label: "История" },
  { id: "gyms", label: "Залы" },
];

/** Цвета плиток программ — по порядку, чтобы соседние отличались. */
const TILE_TONES: Tone[] = ["purple", "orange", "blue", "teal", "pink", "green"];

export function TrainingScreen() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
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

  const toneOf = (id: number) => {
    const index = (templates.data ?? []).findIndex((item) => item.id === id);
    return TILE_TONES[(index < 0 ? id : index) % TILE_TONES.length];
  };

  const start = async (templateId: number) => {
    haptic("success");
    const session = await api.post<{ id: number }>(`/templates/${templateId}/start/`, {});
    navigate(`/workout/${session.id}`);
  };

  const upcoming = upcomingWorkouts(templates.data ?? [], 7);
  const today = upcoming.find((item) => item.offset === 0);
  const later = upcoming.filter((item) => item.offset > 0);

  return (
    <>
      <label className="search">
        <span className="search__icon" aria-hidden="true">
          <Icon name="search" size={18} />
        </span>
        <span className="visually-hidden">Поиск упражнений</span>
        <input
          type="search"
          placeholder="Поиск упражнений"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            // Искать можно откуда угодно — результат всегда в «Упражнениях».
            if (tab !== "library") setTab("library");
          }}
          autoCapitalize="off"
        />
      </label>

      <Segmented label="Раздел тренировок" options={TABS} value={tab} onChange={setTab} />

      {tab === "programs" && (
        <>
          {templates.isLoading && <Loading />}

          {today && (
            <>
              <SectionTitle
                action={
                  <Link className="chip chip--sm" to={`/training/templates/${today.template.id}`}>
                    Редактировать
                  </Link>
                }
              >
                Сегодня
              </SectionTitle>
              <Card>
                <Link to={`/training/templates/${today.template.id}`} className="tile-row">
                  <IconTile icon="dumbbell" tone={toneOf(today.template.id)} size="lg" />
                  <span className="tile-row__text">
                    <span className="tile-row__title">{today.template.name}</span>
                    <span className="tile-row__meta">{templateMeta(today.template)}</span>
                  </span>
                  <span className="tile-row__chevron" aria-hidden="true">
                    <Icon name="chevronRight" size={18} />
                  </span>
                </Link>
                <div style={{ marginTop: "var(--space-3)" }}>
                  <Button variant="primary" size="lg" onClick={() => void start(today.template.id)}>
                    Начать тренировку
                  </Button>
                </div>
              </Card>
            </>
          )}

          {later.length > 0 && (
            <>
              <SectionTitle>Ближайшие тренировки</SectionTitle>
              {later.map((item) => (
                <Link
                  key={`${item.offset}-${item.template.id}`}
                  to={`/training/templates/${item.template.id}`}
                  className="card tile-row"
                >
                  <IconTile icon="dumbbell" tone={toneOf(item.template.id)} size="lg" />
                  <span className="tile-row__text">
                    <span className="tile-row__meta">{formatDay(item.date)}</span>
                    <span className="tile-row__title">{item.template.name}</span>
                    <span className="tile-row__meta">{templateMeta(item.template)}</span>
                  </span>
                  <span className="tile-row__chevron" aria-hidden="true">
                    <Icon name="chevronRight" size={18} />
                  </span>
                </Link>
              ))}
            </>
          )}

          <SectionTitle
            action={
              <Button variant="soft" className="btn--pill" onClick={() => setCreating(true)}>
                <Icon name="plus" size={16} strokeWidth={2.4} />
                Новая программа
              </Button>
            }
          >
            Программы
          </SectionTitle>
          {templates.data?.map((template) => (
            <Link
              key={template.id}
              to={`/training/templates/${template.id}`}
              className="card tile-row"
            >
              <IconTile icon="document" tone={toneOf(template.id)} />
              <span className="tile-row__text">
                <span className="tile-row__title">{template.name}</span>
                <span className="tile-row__meta">
                  ~{template.estimated_minutes} мин
                  {template.duration_limit_minutes && ` из ${template.duration_limit_minutes}`}
                  {template.over_limit && " · дольше лимита"}
                  {" · "}
                  {template.blocks
                    .map((block) => `${block.priority_label.toLowerCase()} ${block.exercises.length}`)
                    .join(" · ")}
                </span>
              </span>
              <span className="tile-row__chevron" aria-hidden="true">
                <Icon name="chevronRight" size={18} />
              </span>
            </Link>
          ))}
          {templates.data?.length === 0 && (
            <Empty>
              Программ пока нет. Создай свою или импортируй план от ИИ в профиле.
            </Empty>
          )}

          <CreateTemplateSheet
            open={creating}
            onClose={() => setCreating(false)}
            onCreated={(template) => {
              void templates.refetch();
              navigate(`/training/templates/${template.id}`);
            }}
          />
        </>
      )}

      {tab === "library" && (
        <>
          {exercises.isLoading && <Loading />}
          <div className="card menu">
            {exercises.data?.map((exercise) => (
              <ListRow
                key={exercise.id}
                to={`/training/exercises/${exercise.id}`}
                title={exercise.name}
                subtitle={
                  <>
                    {LOAD_LABELS[exercise.load_type]}
                    {exercise.is_unilateral && " · на одну сторону"}
                  </>
                }
              />
            ))}
            {exercises.data?.length === 0 && <Empty>Ничего не нашлось.</Empty>}
          </div>
        </>
      )}

      {tab === "history" && (
        <>
          {history.isLoading && <Loading />}
          {history.data?.map((session) => (
            <div key={session.id} className="card tile-row">
              <IconTile
                icon={session.status === "completed" ? "check" : "timer"}
                tone={session.status === "completed" ? "green" : "blue"}
              />
              <span className="tile-row__text">
                <span className="tile-row__meta">{formatDay(session.date)}</span>
                <span className="tile-row__title">{session.template_name ?? "Без плана"}</span>
                <span className="tile-row__meta">
                  {Number(session.tonnage_kg).toFixed(0)} кг ·{" "}
                  {session.duration_seconds ? formatClock(session.duration_seconds) : "—"}
                  {session.is_training_while_injured && " · на больном"}
                </span>
              </span>
              {session.wellbeing_1_10 && (
                <span className="badge tone-blue">{session.wellbeing_1_10}/10</span>
              )}
            </div>
          ))}
          {history.data?.length === 0 && <Empty>История появится после первой тренировки.</Empty>}
        </>
      )}

      {tab === "gyms" && (
        <>
          {gyms.isLoading && <Loading />}
          {gyms.data?.map((gym) => (
            <div key={gym.id} className="card tile-row">
              <IconTile icon="home" tone={gym.is_default ? "blue" : "neutral"} />
              <span className="tile-row__text">
                <span className="tile-row__title">{gym.name}</span>
                <span className="tile-row__meta">
                  {GYM_KINDS[gym.kind]}
                  {gym.is_default && " · основной"}
                  {gym.notes && ` · ${gym.notes}`}
                </span>
              </span>
            </div>
          ))}
          <p className="tiny" style={{ marginTop: "var(--space-3)" }}>
            Веса хранятся отдельно для каждого зала: один и тот же тренажёр
            в разных залах даёт разные цифры на блоке.
          </p>
        </>
      )}
    </>
  );
}

/** Тренировки по расписанию программ на ближайшие дни, начиная с сегодня. */
function upcomingWorkouts(templates: WorkoutTemplate[], days: number) {
  const result: { offset: number; date: Date; template: WorkoutTemplate }[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() + offset);
    const weekday = (date.getDay() + 6) % 7; // 0 — понедельник, как на сервере
    templates
      .filter((template) => template.is_active !== false)
      .filter((template) => template.schedules?.some((item) => item.weekday === weekday))
      .forEach((template) => result.push({ offset, date, template }));
  }
  return result;
}

function templateMeta(template: WorkoutTemplate) {
  const count = template.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
  return `${withPlural(count, "упражнение", "упражнения", "упражнений")} · ~${template.estimated_minutes} мин`;
}

function formatDay(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  const text = value.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
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


export { Button };
