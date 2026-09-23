import { useMemo, useState } from "react";

import { Card } from "../../shared/ui/primitives";
import { MuscleDetailSheet } from "./MuscleDetailSheet";
import { LoadLegend, MuscleChip, RoleLegend, roleFill, zoneFill } from "./legend";
import { computeLoad, rolesFor, zoneOf } from "./load";
import type { CoarseLink, ScaleId, VolumeRow } from "./load";
import { MuscleMap } from "./MuscleMap";
import { MUSCLE_IDS, MUSCLES, ROLE_NAME } from "./muscles";
import type { MuscleId, Role } from "./muscles";

/** «Какие мышцы работают» в одном упражнении — роли тремя цветами. */
export function ExerciseMusclesCard({ name, coarse }: { name: string; coarse?: CoarseLink[] }) {
  const [selected, setSelected] = useState<MuscleId | null>(null);
  const roles = useMemo(() => rolesFor(name, coarse), [name, coarse]);
  if (!roles) return null;

  const byRole = (role: Role) => MUSCLE_IDS.filter((id) => roles[id] === role);

  return (
    <Card title="Какие мышцы работают" icon="body" tone="orange">
      <RoleLegend />
      <div style={{ marginTop: "var(--space-3)" }}>
        <MuscleMap
          compact
          fillFor={(id) => roleFill(roles[id])}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
      <div className="stack stack--tight" style={{ marginTop: "var(--space-3)" }}>
        {(["p", "s", "t"] as Role[]).map((role) =>
          byRole(role).length ? (
            <p key={role} className="muted">
              <span className="strong" style={{ color: "var(--color-text)" }}>
                {ROLE_NAME[role][0].toUpperCase() + ROLE_NAME[role].slice(1)}:
              </span>{" "}
              {byRole(role).map((id) => MUSCLES[id].name).join(", ")}
            </p>
          ) : null,
        )}
      </div>
      <MuscleDetailSheet id={selected} load={null} onClose={() => setSelected(null)} />
    </Card>
  );
}

/**
 * Нагрузка набора упражнений: программа (по плановым подходам) или
 * идущая тренировка (по уже сделанным). Шкала одной тренировки: 3 и 6.
 */
export function WorkoutLoadCard({
  title,
  hint,
  rows,
  scale = "session",
}: {
  title: string;
  hint?: string;
  rows: VolumeRow[];
  scale?: ScaleId;
}) {
  const [selected, setSelected] = useState<MuscleId | null>(null);
  const { load } = useMemo(() => computeLoad(rows), [rows]);
  const ranked = MUSCLE_IDS.filter((id) => load[id].eff > 0).sort((a, b) => load[b].eff - load[a].eff);
  if (ranked.length === 0) return null;

  return (
    <Card title={title} icon="body" tone="orange">
      {hint && (
        <p className="tiny" style={{ marginBottom: "var(--space-2)" }}>
          {hint}
        </p>
      )}
      <LoadLegend scale={scale} />
      <div style={{ marginTop: "var(--space-3)" }}>
        <MuscleMap
          compact
          fillFor={(id) => zoneFill(zoneOf(load[id].eff, scale))}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
      <div className="row row--wrap" style={{ marginTop: "var(--space-3)" }}>
        {ranked.slice(0, 6).map((id) => (
          <MuscleChip
            key={id}
            id={id}
            value={load[id].eff}
            zone={zoneOf(load[id].eff, scale)}
            onClick={() => setSelected(id)}
          />
        ))}
      </div>
      <MuscleDetailSheet
        id={selected}
        load={selected ? load[selected] : null}
        scale={scale}
        onClose={() => setSelected(null)}
      />
    </Card>
  );
}
