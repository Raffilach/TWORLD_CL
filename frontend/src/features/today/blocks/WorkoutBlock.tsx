import { Link, useNavigate } from "react-router-dom";

import { api } from "../../../shared/api/client";
import type { TodayPayload } from "../../../shared/api/types";
import { haptic } from "../../../shared/hooks/useHaptics";
import { Icon } from "../../../shared/ui/icons";
import { withPlural } from "../../../shared/ui/plural";
import { Button, Card, IconTile } from "../../../shared/ui/primitives";

const WEEKDAYS = ["понедельник", "вторник", "среду", "четверг", "пятницу", "субботу", "воскресенье"];

/** Тренировка сегодня. Старт — одна кнопка, план уже развёрнут сервером. */
export function WorkoutBlock({ data }: { data: TodayPayload["workout"] }) {
  const navigate = useNavigate();

  const start = async (templateId?: number) => {
    haptic("success");
    const session = templateId
      ? await api.post<{ id: number }>(`/templates/${templateId}/start/`, {})
      : await api.post<{ id: number }>("/workouts/start_blank/", {});
    navigate(`/workout/${session.id}`);
  };

  if (data.session && data.session.status === "in_progress") {
    return (
      <Card>
        <div className="tile-row" style={{ marginBottom: "var(--space-3)" }}>
          <IconTile icon="timer" tone="blue" />
          <span className="tile-row__text">
            <span className="tile-row__title">Тренировка идёт</span>
            <span className="tile-row__meta">{data.session.template_name ?? "Свободная тренировка"}</span>
          </span>
        </div>
        <Button variant="primary" size="lg" onClick={() => navigate(`/workout/${data.session!.id}`)}>
          Вернуться к тренировке
        </Button>
      </Card>
    );
  }

  if (data.session && data.session.status === "completed") {
    const done = data.session.completion?.required_done;
    return (
      <Card>
        <button
          type="button"
          className="tile-row"
          onClick={() => navigate(`/workout/${data.session!.id}`)}
          aria-label="Посмотреть тренировку"
        >
          <IconTile icon="check" tone="green" />
          <span className="tile-row__text">
            <span className="tile-row__title">Тренировка сделана</span>
            <span className="tile-row__meta">
              {Number(data.session.tonnage_kg).toFixed(0)} кг тоннаж ·{" "}
              {withPlural(data.session.working_sets_count, "рабочий подход", "рабочих подхода", "рабочих подходов")}
              {data.session.wellbeing_1_10 && ` · самочувствие ${data.session.wellbeing_1_10}/10`}
              {done && " · обязательный блок закрыт"}
            </span>
          </span>
          <span className="tile-row__chevron" aria-hidden="true">
            <Icon name="chevronRight" size={18} />
          </span>
        </button>
      </Card>
    );
  }

  if (data.planned_template) {
    const template = data.planned_template;
    const exercises = template.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
    return (
      <Card>
        <Link to={`/training/templates/${template.id}`} className="tile-row">
          <IconTile icon="dumbbell" tone="green" />
          <span className="tile-row__text">
            <span className="tile-row__title">Тренировка по плану</span>
            <span className="tile-row__meta">
              {template.name} · ~{template.estimated_minutes} мин ·{" "}
              {withPlural(exercises, "упражнение", "упражнения", "упражнений")}
            </span>
          </span>
          <span className="tile-row__chevron" aria-hidden="true">
            <Icon name="chevronRight" size={18} />
          </span>
        </Link>
        <div className="thumb-zone">
          <Button variant="primary" size="lg" onClick={() => void start(template.id)}>
            Начать тренировку
          </Button>
        </div>
      </Card>
    );
  }

  const next = data.next_planned;
  const weekday = next ? (new Date(next.date).getDay() + 6) % 7 : null;
  return (
    <Card>
      <div className="tile-row" style={{ marginBottom: "var(--space-3)" }}>
        <IconTile icon="calendar" tone="purple" />
        <span className="tile-row__text">
          <span className="tile-row__title">
            {next ? next.template.name : "Сегодня день отдыха"}
          </span>
          <span className="tile-row__meta">
            {next && weekday !== null
              ? `Следующая по плану — в ${WEEKDAYS[weekday]}`
              : "На сегодня ничего не запланировано"}
          </span>
        </span>
      </div>
      <Button variant="soft" size="lg" onClick={() => void start(next?.template.id)}>
        Начать сейчас
      </Button>
    </Card>
  );
}
