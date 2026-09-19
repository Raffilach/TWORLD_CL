import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import type { Habit } from "../../shared/api/types";
import { Button, Card, Chip, Empty, Notice, Progress } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

interface Challenge {
  id: number;
  title: string;
  target_value: string;
  unit: string;
  started_on: string;
  deadline: string | null;
  auto_rule: Record<string, unknown>;
  is_active: boolean;
  progress: { done: number; target: string; percent: number };
}

interface Replacement {
  id: number;
  habit: number | null;
  text: string;
  order: number;
}

interface TimelineItem {
  hours_after: number;
  title: string;
  description: string;
  reached: boolean;
}

/** Челленджи: произвольная цель с числом, дедлайном и автозачётом из Health. */
export function ChallengesCard() {
  const challenges = useList<Challenge>(["challenges"], "/challenges/");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [autoKm, setAutoKm] = useState("");

  const create = async () => {
    if (!title.trim() || !target) return;
    await api.post("/challenges/", {
      title,
      target_value: target,
      unit: "count",
      started_on: new Date().toISOString().slice(0, 10),
      deadline: deadline || null,
      auto_rule: autoKm
        ? {
            source: "health",
            metric: "distance_m",
            min_value: Number(autoKm) * 1000,
            single_activity: true,
          }
        : {},
    });
    setTitle("");
    setTarget("");
    setAutoKm("");
    setOpen(false);
    await challenges.refetch();
  };

  return (
    <Card
      title="Челленджи"
      action={
        <button type="button" className="card__action" onClick={() => setOpen(true)}>
          Добавить
        </button>
      }
    >
      {challenges.data?.length ? (
        <div className="stack">
          {challenges.data.map((challenge) => (
            <div key={challenge.id}>
              <div className="row row--between">
                <span>{challenge.title}</span>
                <span className="mono">
                  {challenge.progress.done} / {Number(challenge.target_value).toFixed(0)}
                </span>
              </div>
              <Progress value={challenge.progress.done} max={Number(challenge.target_value)} />
              <span className="tiny">
                {challenge.deadline && `до ${challenge.deadline}`}
                {Object.keys(challenge.auto_rule).length > 0 && " · засчитывается из Apple Health"}
              </span>
              <div className="row" style={{ marginTop: "var(--space-2)" }}>
                <Chip
                  small
                  onClick={async () => {
                    await api.post(`/challenges/${challenge.id}/entry/`, { value: 1 });
                    await challenges.refetch();
                  }}
                >
                  + отметить
                </Chip>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>Челленджей пока нет.</Empty>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Новый челлендж">
        <div className="stack">
          <label className="field">
            <span className="field__label">Цель</span>
            <input
              value={title}
              placeholder="29 прогулок по 4 км за лето"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Сколько раз</span>
            <input
              inputMode="numeric"
              value={target}
              placeholder="29"
              onChange={(event) => setTarget(event.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="field">
            <span className="field__label">Дедлайн</span>
            <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Автозачёт: дистанция не меньше, км</span>
            <input
              inputMode="decimal"
              value={autoKm}
              placeholder="4"
              onChange={(event) => setAutoKm(event.target.value.replace(/[^\d.,]/g, ""))}
            />
            <span className="field__hint">
              Засчитаются только активности из Apple Health, прошедшие этот порог
              за один раз.
            </span>
          </label>
          <Button variant="primary" size="lg" onClick={() => void create()}>
            Создать
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}

/** Личные заменители: то, что реально помогает в момент тяги. */
export function ReplacementsCard({ habits }: { habits: Habit[] }) {
  const replacements = useList<Replacement>(["replacements"], "/replacements/");
  const [text, setText] = useState("");
  const [habitId, setHabitId] = useState<number | null>(habits[0]?.id ?? null);

  const add = async () => {
    if (!text.trim()) return;
    await api.post("/replacements/", { habit: habitId, text, order: 0 });
    setText("");
    await replacements.refetch();
  };

  return (
    <Card title="Заменители">
      <p className="tiny" style={{ marginBottom: "var(--space-2)" }}>
        Показываются на экране SOS — в момент тяги придумывать поздно.
      </p>
      {replacements.data?.length ? (
        <ul className="list">
          {replacements.data.map((item) => (
            <li key={item.id} className="list__item">
              <span className="grow">{item.text}</span>
              <button
                type="button"
                className="btn btn--ghost btn--square"
                aria-label="Удалить"
                onClick={async () => {
                  await api.delete(`/replacements/${item.id}/`);
                  await replacements.refetch();
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Пока пусто.</Empty>
      )}

      {habits.length > 1 && (
        <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
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

      <div className="row" style={{ gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        <input
          className="grow"
          value={text}
          placeholder="Стакан воды"
          onChange={(event) => setText(event.target.value)}
        />
        <Button onClick={() => void add()} aria-label="Добавить заменитель">
          +
        </Button>
      </div>
    </Card>
  );
}

/** Таймлайн улучшений здоровья по текущей серии отказа. */
export function HealthTimelineCard({ habitId }: { habitId: number }) {
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);

  const load = async () => {
    const response = await api.get<{ health_timeline: TimelineItem[] }>(
      `/habits/${habitId}/timeline/`,
    );
    setTimeline(response.health_timeline);
  };

  if (timeline === null) {
    return (
      <Card title="Что уже изменилось">
        <Button onClick={() => void load()}>Показать таймлайн здоровья</Button>
      </Card>
    );
  }

  if (timeline.length === 0) {
    return (
      <Card title="Что уже изменилось">
        <Notice tone="info">
          Для этой привычки таймлайн не заведён. Он есть у отказа от курения,
          сахара и алкоголя.
        </Notice>
      </Card>
    );
  }

  return (
    <Card title="Что уже изменилось">
      <ul className="list">
        {timeline.map((item) => (
          <li key={item.hours_after} className="list__item">
            <span className={`status-dot ${item.reached ? "status-dot--done" : ""}`} aria-hidden="true" />
            <span className="grow">
              {item.title}
              {item.description && (
                <>
                  <br />
                  <span className="tiny">{item.description}</span>
                </>
              )}
            </span>
            <span className="tiny">
              {item.hours_after < 48 ? `${item.hours_after} ч` : `${Math.round(item.hours_after / 24)} дн.`}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
