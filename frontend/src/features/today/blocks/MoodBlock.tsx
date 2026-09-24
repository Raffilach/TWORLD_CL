import { api } from "../../../shared/api/client";
import { submitOrQueue } from "../../../shared/offline/submit";
import type { TodayPayload } from "../../../shared/api/types";
import { haptic } from "../../../shared/hooks/useHaptics";
import { Card, DotScale, IconTile } from "../../../shared/ui/primitives";

/** Две шкалы 1–5 точками, по тапу. Без модалок и без подписей с оценкой. */
export function MoodBlock({
  data,
  onChanged,
}: {
  data: TodayPayload["mood_energy"];
  onChanged: () => void;
}) {
  const set = async (patch: Record<string, number>) => {
    haptic("tap");
    if (!navigator.onLine) {
      await submitOrQueue("daily_log", "/journal/daily/", {
        date: new Date().toISOString().slice(0, 10),
        ...patch,
      });
      return;
    }
    await api.post("/journal/daily/set/", patch);
    onChanged();
  };

  return (
    <Card className="card--tight">
      <div className="metric">
        <IconTile icon="smile" tone="green" />
        <div className="metric__body" style={{ gap: 0 }}>
          <span className="metric__label">Настроение</span>
          <DotScale
            label="Настроение"
            value={data.mood_1_5}
            onChange={(value) => void set({ mood_1_5: value })}
          />
        </div>
      </div>
      <div className="metric">
        <IconTile icon="bolt" tone="orange" />
        <div className="metric__body" style={{ gap: 0 }}>
          <span className="metric__label">Энергия</span>
          <DotScale
            label="Энергия"
            tone="orange"
            value={data.energy_1_5}
            onChange={(value) => void set({ energy_1_5: value })}
          />
        </div>
      </div>
    </Card>
  );
}
