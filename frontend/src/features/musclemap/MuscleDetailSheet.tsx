import { Sheet } from "../../shared/ui/Sheet";
import { exercisesFor, formatEff, ZONE_NAMES, zoneOf } from "./load";
import type { MuscleLoad, ScaleId } from "./load";
import { GROUPS, MUSCLES, ROLE_NAME } from "./muscles";
import type { MuscleId } from "./muscles";

/**
 * Карточка мышцы: что это, откуда нагрузка и чем добрать.
 * Открывается тапом по мышце на карте или по чипу в списке.
 */
export function MuscleDetailSheet({
  id,
  load,
  scale,
  onClose,
}: {
  id: MuscleId | null;
  load: MuscleLoad | null;
  scale?: ScaleId;
  onClose: () => void;
}) {
  if (!id) return null;
  const muscle = MUSCLES[id];
  const group = GROUPS.find((item) => item.id === muscle.group)?.name;
  const zone = load && scale ? zoneOf(load.eff, scale) : null;
  const suggestions = exercisesFor(id).slice(0, 6);

  return (
    <Sheet open onClose={onClose} title={muscle.name}>
      <p className="tiny" style={{ fontStyle: "italic" }}>
        {muscle.latin}
      </p>
      <div className="row row--wrap" style={{ margin: "var(--space-2) 0 var(--space-3)" }}>
        {group && <span className="tag tone-blue">{group}</span>}
        {zone !== null && load && (
          <span className="tag" style={{ background: "var(--color-surface-sunken)", color: "var(--color-text)" }}>
            <span className={`load-dot load-dot--${zone}`} style={{ marginRight: 6 }} />
            {ZONE_NAMES[zone]} · {formatEff(load.eff)} эфф. подх.
          </span>
        )}
      </div>
      <p className="muted" style={{ marginBottom: "var(--space-4)" }}>
        {muscle.fn}
      </p>

      {load && load.contribs.length > 0 && (
        <>
          <p className="field__label">Откуда нагрузка</p>
          <div className="list" style={{ marginBottom: "var(--space-4)" }}>
            {load.contribs.map((item) => (
              <div key={item.name} className="list__item" style={{ padding: "var(--space-2) 0" }}>
                <span className="grow">
                  {item.name}
                  <br />
                  <span className="tiny">
                    {ROLE_NAME[item.role]} · {item.sets} подх.
                  </span>
                </span>
                <span className="strong">+{formatEff(item.eff)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {suggestions.length > 0 && (
        <>
          <p className="field__label">Где она основная</p>
          <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
            {suggestions.map((exercise) => (
              <span key={exercise.id} className="tag tone-green">
                {exercise.name}
              </span>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
