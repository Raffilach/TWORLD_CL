import { api } from "../../../shared/api/client";
import { submitOrQueue } from "../../../shared/offline/submit";
import type { TodayPayload } from "../../../shared/api/types";
import { haptic } from "../../../shared/hooks/useHaptics";
import { Card, Scale } from "../../../shared/ui/primitives";

/** Две шкалы 1–5, по тапу. Без модалок и без подписей с оценкой. */
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
    <Card title="Как дела">
      <div className="stack">
        <Scale
          label="Настроение"
          value={data.mood_1_5}
          onChange={(value) => void set({ mood_1_5: value })}
        />
        <Scale
          label="Энергия"
          value={data.energy_1_5}
          onChange={(value) => void set({ energy_1_5: value })}
        />
      </div>
    </Card>
  );
}
