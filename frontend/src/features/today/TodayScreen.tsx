import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../shared/api/client";
import type { TodayPayload } from "../../shared/api/types";
import { cacheGet, cacheSet } from "../../shared/offline/db";
import { Card, Loading, Notice } from "../../shared/ui/primitives";
import { DayProgressBlock } from "./blocks/DayProgressBlock";
import { EveningPlanBlock } from "./blocks/EveningPlanBlock";
import { HabitsBlock } from "./blocks/HabitsBlock";
import { MoodBlock } from "./blocks/MoodBlock";
import { QuickChecksBlock } from "./blocks/QuickChecksBlock";
import { SleepBlock } from "./blocks/SleepBlock";
import { WeightBlock } from "./blocks/WeightBlock";
import { TodayLayoutEditor } from "./TodayLayoutEditor";

const TODAY_KEY = "today";

/**
 * Главный экран. Пользователь проводит здесь 90% времени, поэтому
 * всё делается в один тап и без переходов на другие страницы.
 *
 * Данные приходят одним запросом и кэшируются в IndexedDB: в метро
 * экран открывается мгновенно и остаётся рабочим.
 */
export function TodayScreen() {
  const [editing, setEditing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: [TODAY_KEY],
    queryFn: async () => {
      try {
        const payload = await api.get<TodayPayload>("/today/");
        void cacheSet(TODAY_KEY, payload);
        return payload;
      } catch (error) {
        const cached = await cacheGet<TodayPayload>(TODAY_KEY);
        if (cached) return cached;
        throw error;
      }
    },
  });

  if (isLoading || !data) return <Loading />;

  const onChanged = () => void refetch();
  const visible = (data.layout ?? [])
    .filter((block) => block.visible)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((block) => block.block_id);

  const blocks: Record<string, JSX.Element | null> = {
    weight: <WeightBlock data={data.weight} onChanged={onChanged} />,
    workout: <WorkoutBlockLazy data={data.workout} />,
    quick_checks: <QuickChecksBlock data={data.nutrition} onChanged={onChanged} />,
    habits: <HabitsBlock habits={data.habits} onChanged={onChanged} />,
    sleep: <SleepBlock data={data.sleep} onChanged={onChanged} />,
    mood_energy: <MoodBlock data={data.mood_energy} onChanged={onChanged} />,
    evening_plan: <EveningPlanBlock data={data.evening_plan} />,
    day_progress: <DayProgressBlock data={data.day_progress} />,
    journal_quick: <JournalQuickBlock onChanged={onChanged} />,
    measurements_due: null,
    photo_due: null,
  };

  return (
    <>
      <div className="row row--between" style={{ marginBottom: "var(--space-3)" }}>
        <span className="muted">{formatToday(data.date)}</span>
        <button type="button" className="card__action" onClick={() => setEditing(true)}>
          Настроить
        </button>
      </div>

      {data.safety_notices.map((notice) => (
        <div key={notice.id} style={{ marginBottom: "var(--space-3)" }}>
          <Notice>
            Второй эпизод в зоне «{notice.body_part}» за {notice.days_between} дней.
            Повторяющаяся травма в одном месте — повод показаться врачу, а не переждать.
          </Notice>
        </div>
      ))}

      <div className="cols-2">
        {visible.map((id) => (
          <div key={id}>{blocks[id]}</div>
        ))}
      </div>

      <TodayLayoutEditor
        open={editing}
        layout={data.layout}
        onClose={() => {
          setEditing(false);
          onChanged();
        }}
      />
    </>
  );
}

function formatToday(date: string) {
  return new Date(date).toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Отдельный файл импортируется лениво, чтобы не тянуть роутер в блок. */
import { WorkoutBlock } from "./blocks/WorkoutBlock";
function WorkoutBlockLazy({ data }: { data: TodayPayload["workout"] }) {
  return <WorkoutBlock data={data} />;
}

/** Быстрая запись в дневник — выключена по умолчанию, включается в настройках. */
function JournalQuickBlock({ onChanged }: { onChanged: () => void }) {
  const [text, setText] = useState("");
  return (
    <Card title="Запись дня">
      <textarea
        rows={3}
        value={text}
        placeholder="Без обязательных полей"
        onChange={(event) => setText(event.target.value)}
        onBlur={async () => {
          if (!text.trim()) return;
          const now = new Date();
          await api.post("/journal/entries/", {
            date: now.toISOString().slice(0, 10),
            at: now.toISOString(),
            text,
          });
          setText("");
          onChanged();
        }}
      />
    </Card>
  );
}
