import type { TodayPayload } from "../../../shared/api/types";
import { Card, Ring } from "../../../shared/ui/primitives";

/**
 * Прогресс дня — кольцом, как на часах.
 *
 * Пустое показывается нейтрально: пропуск — это данные, а не провал.
 * Ни красного цвета, ни восклицательных знаков, ни «ты пропустил».
 */
export function DayProgressBlock({ data }: { data: TodayPayload["day_progress"] }) {
  const share = data.total > 0 ? data.done / data.total : 0;
  const [headline, text] =
    data.done === 0
      ? ["День только начался", "Ещё есть время. Или не сегодня — это тоже нормально."]
      : share >= 1
        ? ["Всё отмечено", "Хороший день. Остальное — отдых и сон."]
        : share >= 0.5
          ? ["Хороший прогресс", "Спокойный темп ведёт к большим результатам."]
          : ["Начало положено", "Каждая отметка — это данные, а не оценка."];

  return (
    <Card className="card--hero">
      <div className="row" style={{ gap: "var(--space-4)" }}>
        <div className="grow">
          <p className="strong" style={{ fontSize: "var(--font-size-lg)" }}>
            {headline}
          </p>
          <p className="muted" style={{ marginTop: "var(--space-1)" }}>
            {text}
          </p>
        </div>
        <Ring value={data.done} max={data.total}>
          <span className="big-number">
            {data.done}
            <small>/{data.total}</small>
          </span>
          <span className="tiny">на сегодня</span>
        </Ring>
      </div>
    </Card>
  );
}
