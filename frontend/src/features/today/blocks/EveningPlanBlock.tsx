import type { TodayPayload } from "../../../shared/api/types";
import { Card } from "../../../shared/ui/primitives";

/**
 * «Во сколько выйти из зала, чтобы лечь вовремя».
 *
 * Реальная причина хронического недосыпа — не лень, а арифметика вечера:
 * работа до 18, два часа зала, час дороги.
 */
export function EveningPlanBlock({ data }: { data: TodayPayload["evening_plan"] }) {
  if (!data?.leave_gym_by) return null;
  return (
    <Card title="Вечер">
      <p className="big-number">Выйти до {data.leave_gym_by}</p>
      <p className="muted">{data.explanation}</p>
    </Card>
  );
}
