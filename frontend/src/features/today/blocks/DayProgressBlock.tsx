import type { TodayPayload } from "../../../shared/api/types";
import { Card, Progress } from "../../../shared/ui/primitives";

/**
 * Прогресс дня.
 *
 * Пустое показывается нейтрально: пропуск — это данные, а не провал.
 * Ни красного цвета, ни восклицательных знаков, ни «ты пропустил».
 */
export function DayProgressBlock({ data }: { data: TodayPayload["day_progress"] }) {
  return (
    <Card title="Прогресс дня">
      <div className="row row--between" style={{ marginBottom: "var(--space-2)" }}>
        <span className="big-number">
          {data.done} <span className="muted">из {data.total}</span>
        </span>
      </div>
      <Progress value={data.done} max={data.total} />
      {data.done === 0 && (
        <p className="muted" style={{ marginTop: "var(--space-3)" }}>
          Ещё есть время. Или не сегодня — это тоже нормально.
        </p>
      )}
    </Card>
  );
}
