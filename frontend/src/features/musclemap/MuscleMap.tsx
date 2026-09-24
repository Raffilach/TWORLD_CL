import { useId } from "react";

import { BACK, BACK_DETAILS, EAR, FRONT, FRONT_DETAILS, OUTLINE, VIEWBOX } from "./anatomy";
import type { MusclePath } from "./anatomy";
import { MUSCLES } from "./muscles";
import type { MuscleId } from "./muscles";

export type View = "front" | "back";

const VIEWS: Record<View, { muscles: MusclePath[]; details: string[]; label: string }> = {
  front: { muscles: FRONT, details: FRONT_DETAILS, label: "Вид спереди" },
  back: { muscles: BACK, details: BACK_DETAILS, label: "Вид сзади" },
};

/**
 * Анатомическая карта: вид спереди и сзади, 44 мышцы.
 *
 * Рисуется левая половина тела, правая — её зеркальное отражение; обе
 * половины кликабельны. Цвет каждой мышцы задаёт `fillFor` — карта
 * не знает, что именно она показывает: нагрузку за неделю или роли
 * мышц в одном упражнении.
 */
export function MuscleMap({
  fillFor,
  selected = null,
  onSelect,
  views = ["front", "back"],
  dim,
  compact = false,
}: {
  fillFor: (id: MuscleId) => string;
  selected?: MuscleId | null;
  onSelect?: (id: MuscleId) => void;
  views?: View[];
  /** Приглушить мышцы, которые не участвуют (режим «роли в упражнении»). */
  dim?: (id: MuscleId) => boolean;
  compact?: boolean;
}) {
  return (
    <div className={`muscle-map ${compact ? "muscle-map--compact" : ""}`}>
      {views.map((view) => (
        <Figure
          key={view}
          view={view}
          fillFor={fillFor}
          selected={selected}
          onSelect={onSelect}
          dim={dim}
          compact={compact}
        />
      ))}
    </div>
  );
}

function Figure({
  view,
  fillFor,
  selected,
  onSelect,
  dim,
  compact,
}: {
  view: View;
  fillFor: (id: MuscleId) => string;
  selected: MuscleId | null;
  onSelect?: (id: MuscleId) => void;
  dim?: (id: MuscleId) => boolean;
  compact: boolean;
}) {
  const shadeId = `shade-${view}-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { muscles, details, label } = VIEWS[view];

  const half = (primary: boolean) => (
    <>
      <path d={`${OUTLINE} L202,478 L202,22 Z`} className="muscle-map__skin" />
      <path d={EAR} className="muscle-map__skin muscle-map__ear" />
      {muscles.map((muscle, index) => {
        const interactive = Boolean(onSelect);
        return (
          <path
            key={`${muscle.id}-${index}`}
            d={muscle.d}
            fill={fillFor(muscle.id)}
            className={[
              "muscle-map__muscle",
              selected === muscle.id && "is-selected",
              dim?.(muscle.id) && "is-dim",
              interactive && "is-interactive",
            ]
              .filter(Boolean)
              .join(" ")}
            // Фокус с клавиатуры — только на левой половине, чтобы Tab
            // не проходил каждую мышцу дважды.
            tabIndex={interactive && primary ? 0 : undefined}
            role={interactive && primary ? "button" : undefined}
            aria-label={interactive && primary ? MUSCLES[muscle.id].name : undefined}
            onClick={interactive ? () => onSelect?.(muscle.id) : undefined}
            onKeyDown={
              interactive && primary
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect?.(muscle.id);
                    }
                  }
                : undefined
            }
          >
            {!interactive && <title>{MUSCLES[muscle.id].name}</title>}
          </path>
        );
      })}
      {muscles.map((muscle, index) => (
        <path key={`shade-${index}`} d={muscle.d} fill={`url(#${shadeId})`} pointerEvents="none" />
      ))}
      {details.map((d) => (
        <path key={d} d={d} className="muscle-map__detail" />
      ))}
      <path d={OUTLINE} className="muscle-map__outline" />
    </>
  );

  return (
    <figure className="muscle-map__figure">
      <svg viewBox={VIEWBOX} role="img" aria-label={`Мышцы, ${label.toLowerCase()}`}>
        <defs>
          <linearGradient id={shadeId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".28" />
            <stop offset=".42" stopColor="#fff" stopOpacity="0" />
            <stop offset=".62" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".16" />
          </linearGradient>
        </defs>
        <ellipse cx="200" cy="880" rx="78" ry="7" className="muscle-map__floor" />
        <g>{half(true)}</g>
        <g transform="matrix(-1 0 0 1 400 0)">{half(false)}</g>
      </svg>
      {!compact && <figcaption>{label}</figcaption>}
    </figure>
  );
}
