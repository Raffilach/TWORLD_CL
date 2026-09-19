import { useNavigate } from "react-router-dom";

import { api } from "../../../shared/api/client";
import type { TodayPayload } from "../../../shared/api/types";
import { haptic } from "../../../shared/hooks/useHaptics";
import { withPlural } from "../../../shared/ui/plural";
import { Button, Card } from "../../../shared/ui/primitives";

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
      <Card title="Тренировка идёт">
        <Button variant="primary" size="lg" onClick={() => navigate(`/workout/${data.session!.id}`)}>
          Вернуться к тренировке
        </Button>
      </Card>
    );
  }

  if (data.session && data.session.status === "completed") {
    const done = data.session.completion?.required_done;
    return (
      <Card title="Тренировка сделана">
        <p className="big-number">{Number(data.session.tonnage_kg).toFixed(0)} кг</p>
        <p className="muted">
          тоннаж · {withPlural(data.session.working_sets_count, "рабочий подход", "рабочих подхода", "рабочих подходов")}
          {data.session.wellbeing_1_10 && ` · самочувствие ${data.session.wellbeing_1_10}/10`}
        </p>
        {done && <p className="muted" style={{ marginTop: "var(--space-2)" }}>Обязательный блок закрыт.</p>}
        <div style={{ marginTop: "var(--space-3)" }}>
          <Button onClick={() => navigate(`/workout/${data.session!.id}`)}>Посмотреть</Button>
        </div>
      </Card>
    );
  }

  if (data.planned_template) {
    const template = data.planned_template;
    const required = template.blocks.find((block) => block.priority === "required");
    return (
      <Card title="Тренировка сегодня">
        <p className="big-number">{template.name}</p>
        <p className="muted">
          ~{template.estimated_minutes} мин
          {required &&
            ` · обязательный блок: ${withPlural(required.exercises.length, "упражнение", "упражнения", "упражнений")}`}
        </p>
        {required && (
          <ul className="muted" style={{ marginTop: "var(--space-2)" }}>
            {required.exercises.slice(0, 4).map((item) => (
              <li key={item.id}>· {item.exercise_name}</li>
            ))}
          </ul>
        )}
        <div className="thumb-zone">
          <Button variant="primary" size="lg" onClick={() => void start(template.id)}>
            Начать
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Тренировка">
      {data.next_planned ? (
        <p>
          Следующая — в {WEEKDAYS[new Date(data.next_planned.date).getDay() === 0 ? 6 : new Date(data.next_planned.date).getDay() - 1]}:{" "}
          <strong>{data.next_planned.template.name}</strong>
        </p>
      ) : (
        <p className="muted">На сегодня ничего не запланировано.</p>
      )}
      <div style={{ marginTop: "var(--space-3)" }}>
        <Button onClick={() => void start(data.next_planned?.template.id)}>Начать сейчас</Button>
      </div>
    </Card>
  );
}
