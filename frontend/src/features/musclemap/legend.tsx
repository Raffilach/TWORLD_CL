import { formatEff, SCALES, ZONE_NAMES } from "./load";
import type { ScaleId, Zone } from "./load";
import { MUSCLES } from "./muscles";
import type { MuscleId, Role } from "./muscles";

/** Цвет зоны нагрузки — из токенов, чтобы тёмная тема работала сама. */
export function zoneFill(zone: Zone): string {
  return ["var(--load-none)", "var(--load-low)", "var(--load-mid)", "var(--load-high)"][zone];
}

/** Роли мышцы в одном упражнении — те же три цвета: основная ярче всех. */
export function roleFill(role: Role | undefined): string {
  if (role === "p") return "var(--load-high)";
  if (role === "s") return "var(--load-mid)";
  if (role === "t") return "var(--load-low)";
  return "var(--load-none)";
}

export function LoadLegend({ scale }: { scale: ScaleId }) {
  const { t1, t2 } = SCALES[scale];
  const items: [Zone, string][] = [
    [3, `≥ ${t2}`],
    [2, `${t1}–${t2}`],
    [1, `< ${t1}`],
    [0, "0"],
  ];
  return (
    <div className="load-legend" aria-label="Шкала нагрузки в эффективных подходах">
      {items.map(([zone, range]) => (
        <span key={zone} className="load-legend__item">
          <span className={`load-dot load-dot--${zone}`} />
          {ZONE_NAMES[zone]} {range}
        </span>
      ))}
    </div>
  );
}

export function RoleLegend() {
  const items: [Role, string, Zone][] = [
    ["p", "Основная", 3],
    ["s", "Вспомогательная", 2],
    ["t", "Стабилизатор", 1],
  ];
  return (
    <div className="load-legend">
      {items.map(([role, label, zone]) => (
        <span key={role} className="load-legend__item">
          <span className={`load-dot load-dot--${zone}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Чип мышцы со значением: «● Большая ягодичная 9,5». */
export function MuscleChip({
  id,
  value,
  zone,
  onClick,
}: {
  id: MuscleId;
  value: number;
  zone: Zone;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="muscle-chip" onClick={onClick}>
      <span className={`load-dot load-dot--${zone}`} />
      {MUSCLES[id].name}
      <b>{formatEff(value)}</b>
    </button>
  );
}
