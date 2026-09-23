import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api } from "../../shared/api/client";
import type { WorkoutSession } from "../../shared/api/types";
import { Card, Empty, Loading, Segmented } from "../../shared/ui/primitives";
import { plural } from "../../shared/ui/plural";
import { MuscleDetailSheet } from "./MuscleDetailSheet";
import { LoadLegend, MuscleChip, zoneFill } from "./legend";
import { computeLoad, formatEff, SCALES, zoneOf } from "./load";
import type { ScaleId, VolumeRow, Zone } from "./load";
import { MuscleMap } from "./MuscleMap";
import { GROUPS, MUSCLE_IDS, MUSCLES } from "./muscles";
import type { MuscleId } from "./muscles";

interface VolumeResponse {
  period: { from: string; to: string } | null;
  sessions: number;
  exercises: {
    exercise: number;
    name: string;
    working_sets: number;
    sessions: number;
    muscles: { code: string; role: string }[];
  }[];
}

type Period = "week" | "session";

/**
 * Мышечная карта нагрузки по реальным тренировкам.
 *
 * Считается в эффективных подходах: рабочий подход даёт основной мышце 1,
 * вспомогательной 0,5, стабилизатору 0,25. Шкала трёхцветная: для недели
 * пороги 6 и 12, для одной тренировки — 3 и 6.
 */
export function MuscleLoadTab() {
  const [period, setPeriod] = useState<Period>("week");
  const [selected, setSelected] = useState<MuscleId | null>(null);
  const scale: ScaleId = period === "week" ? "week" : "session";

  const latest = useQuery({
    queryKey: ["workouts", "latest"],
    queryFn: async () => {
      const response = await api.get<{ results: WorkoutSession[] }>("/workouts/", { page_size: 10 });
      return (
        response.results.find((item) => item.status === "in_progress" || item.status === "completed") ??
        null
      );
    },
    enabled: period === "session",
  });

  const sessionId = latest.data?.id;
  const volume = useQuery({
    queryKey: ["exercise-volume", period, sessionId],
    queryFn: () =>
      api.get<VolumeResponse>(
        "/analytics/exercise-volume/",
        period === "session" ? { session: sessionId } : undefined,
      ),
    enabled: period === "week" || Boolean(sessionId),
  });

  const result = useMemo(() => {
    const rows: VolumeRow[] = (volume.data?.exercises ?? []).map((item) => ({
      name: item.name,
      sets: item.working_sets,
      coarse: item.muscles,
    }));
    return computeLoad(rows);
  }, [volume.data]);

  const { load, unknown } = result;
  const zones = useMemo(
    () => Object.fromEntries(MUSCLE_IDS.map((id) => [id, zoneOf(load[id].eff, scale)])) as Record<MuscleId, Zone>,
    [load, scale],
  );

  const ranked = MUSCLE_IDS.filter((id) => load[id].eff > 0).sort((a, b) => load[b].eff - load[a].eff);
  const idle = MUSCLE_IDS.filter((id) => load[id].eff === 0);
  const counts = [0, 1, 2, 3].map((zone) => MUSCLE_IDS.filter((id) => zones[id] === zone).length);
  const totalSets = (volume.data?.exercises ?? []).reduce((sum, item) => sum + item.working_sets, 0);

  const loading = volume.isLoading || (period === "session" && latest.isLoading);

  return (
    <>
      <Segmented
        label="Период"
        value={period}
        onChange={(value) => {
          setPeriod(value);
          setSelected(null);
        }}
        options={[
          { id: "week", label: "7 дней" },
          { id: "session", label: "Последняя тренировка" },
        ]}
      />

      <Card>
        <div className="row row--between" style={{ marginBottom: "var(--space-3)", alignItems: "flex-start" }}>
          <div>
            <p className="strong">Нагрузка на мышцы</p>
            <p className="tiny">
              {period === "week"
                ? `${volume.data?.sessions ?? 0} ${plural(volume.data?.sessions ?? 0, "тренировка", "тренировки", "тренировок")} · ${totalSets} ${plural(totalSets, "рабочий подход", "рабочих подхода", "рабочих подходов")}`
                : latest.data
                  ? `${latest.data.template_name ?? "Тренировка"} · ${formatDate(latest.data.date)} · ${totalSets} ${plural(totalSets, "подход", "подхода", "подходов")}`
                  : "Тренировок пока нет"}
            </p>
          </div>
        </div>

        <LoadLegend scale={scale} />

        {loading ? (
          <Loading />
        ) : totalSets === 0 ? (
          <Empty>
            {period === "week"
              ? "За последние 7 дней рабочих подходов нет — карта окрасится после первой тренировки."
              : "В этой тренировке пока нет рабочих подходов."}
          </Empty>
        ) : (
          <div style={{ marginTop: "var(--space-3)" }}>
            <MuscleMap fillFor={(id) => zoneFill(zones[id])} selected={selected} onSelect={setSelected} />
            <p className="tiny center" style={{ marginTop: "var(--space-2)" }}>
              Нажми на мышцу — покажем, откуда нагрузка и чем добрать.
            </p>
          </div>
        )}
      </Card>

      {totalSets > 0 && (
        <>
          <div className="grid-2">
            {([3, 2, 1, 0] as Zone[]).map((zone) => (
              <section key={zone} className="card">
                <p className="stat__label row" style={{ gap: 6 }}>
                  <span className={`load-dot load-dot--${zone}`} /> {ZONE_TITLES[zone]}
                </p>
                <p className="big-number">{counts[zone]}</p>
                <p className="muted">{plural(counts[zone], "мышца", "мышцы", "мышц")}</p>
              </section>
            ))}
          </div>

          <Card title="Самые нагруженные" icon="flame" tone="orange">
            <div className="row row--wrap">
              {ranked.slice(0, 8).map((id) => (
                <MuscleChip key={id} id={id} value={load[id].eff} zone={zones[id]} onClick={() => setSelected(id)} />
              ))}
            </div>
          </Card>

          {idle.length > 0 && (
            <Card title={`Без нагрузки · ${idle.length}`} icon="target" tone="blue">
              <p className="tiny" style={{ marginBottom: "var(--space-2)" }}>
                Не обязательно добирать всё: шея или большеберцовая редко нужны
                отдельно. Но если здесь крупная мышца — это повод поправить программу.
              </p>
              <div className="row row--wrap">
                {idle.map((id) => (
                  <MuscleChip key={id} id={id} value={0} zone={0} onClick={() => setSelected(id)} />
                ))}
              </div>
            </Card>
          )}

          <Card title="По группам" icon="chart" tone="purple">
            <div className="stack">
              {GROUPS.map((group) => {
                const ids = MUSCLE_IDS.filter((id) => MUSCLES[id].group === group.id);
                const max = Math.max(...ids.map((id) => load[id].eff));
                return (
                  <div key={group.id}>
                    <div className="row row--between" style={{ marginBottom: 6 }}>
                      <span className="row" style={{ gap: 6 }}>
                        <span className={`load-dot load-dot--${zoneOf(max, scale)}`} />
                        <span className="strong" style={{ fontSize: "var(--font-size-sm)" }}>{group.name}</span>
                      </span>
                      <span className="tiny">макс. {formatEff(max)}</span>
                    </div>
                    <div className="zone-bar" aria-hidden="true">
                      {ids.map((id) => (
                        <span key={id} className={`z${zones[id]}`} style={{ flex: 1 }} title={MUSCLES[id].name} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {unknown.length > 0 && (
            <p className="tiny" style={{ marginBottom: "var(--space-3)" }}>
              Не на карте: {unknown.join(", ")} — у своих упражнений не размечены мышцы.
              Их можно указать в карточке упражнения.
            </p>
          )}
          <p className="tiny">
            Эффективные подходы: основная мышца × 1, вспомогательная × 0,5, стабилизатор × 0,25.
            Пороги {period === "week" ? "недели" : "тренировки"}: {SCALES[scale].t1} и {SCALES[scale].t2}.
          </p>
        </>
      )}

      <MuscleDetailSheet
        id={selected}
        load={selected ? load[selected] : null}
        scale={scale}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

const ZONE_TITLES: Record<Zone, string> = {
  3: "Высокая",
  2: "Средняя",
  1: "Низкая",
  0: "Без нагрузки",
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
