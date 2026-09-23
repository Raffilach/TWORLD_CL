import type { TodayPayload } from "../../../shared/api/types";
import { Card, IconTile } from "../../../shared/ui/primitives";

/**
 * «Во сколько выйти из зала, чтобы лечь вовремя».
 *
 * Реальная причина хронического недосыпа — не лень, а арифметика вечера:
 * работа до 18, два часа зала, час дороги.
 */
export function EveningPlanBlock({ data }: { data: TodayPayload["evening_plan"] }) {
  if (!data?.leave_gym_by) return null;
  return (
    <Card className="card--tinted tone-purple">
      <div className="tile-row" style={{ alignItems: "flex-start" }}>
        <IconTile icon="moon" tone="purple" />
        <span className="tile-row__text">
          <span className="tile-row__title">Выйти из зала до {data.leave_gym_by}</span>
          <span className="muted">{data.explanation}</span>
        </span>
      </div>
    </Card>
  );
}
