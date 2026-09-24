import { useState } from "react";

/**
 * Схематичная карта тела: локализация травмы выбирается тапом.
 *
 * Это единственный способ уложить ввод в пару касаний — списком из
 * семнадцати зон никто пользоваться не станет.
 */
export interface BodyPartOption {
  id: number;
  code: string;
  name_ru: string;
  view: "front" | "back" | "both";
}

interface Zone {
  code: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

// Координаты в системе 120×260 — схематичная фигура, не анатомия.
const FRONT: Zone[] = [
  { code: "neck", cx: 60, cy: 38, rx: 9, ry: 7 },
  { code: "shoulder_r", cx: 36, cy: 56, rx: 11, ry: 10 },
  { code: "shoulder_l", cx: 84, cy: 56, rx: 11, ry: 10 },
  { code: "chest", cx: 60, cy: 68, rx: 20, ry: 13 },
  { code: "elbow_r", cx: 25, cy: 96, rx: 8, ry: 9 },
  { code: "elbow_l", cx: 95, cy: 96, rx: 8, ry: 9 },
  { code: "abdomen", cx: 60, cy: 100, rx: 18, ry: 16 },
  { code: "wrist_r", cx: 19, cy: 130, rx: 7, ry: 8 },
  { code: "wrist_l", cx: 101, cy: 130, rx: 7, ry: 8 },
  { code: "hip_r", cx: 47, cy: 130, rx: 12, ry: 11 },
  { code: "hip_l", cx: 73, cy: 130, rx: 12, ry: 11 },
  { code: "knee_r", cx: 47, cy: 182, rx: 10, ry: 11 },
  { code: "knee_l", cx: 73, cy: 182, rx: 10, ry: 11 },
  { code: "ankle_r", cx: 47, cy: 232, rx: 9, ry: 9 },
  { code: "ankle_l", cx: 73, cy: 232, rx: 9, ry: 9 },
];

const BACK: Zone[] = [
  { code: "neck", cx: 60, cy: 38, rx: 9, ry: 7 },
  { code: "shoulder_l", cx: 36, cy: 56, rx: 11, ry: 10 },
  { code: "shoulder_r", cx: 84, cy: 56, rx: 11, ry: 10 },
  { code: "upper_back", cx: 60, cy: 72, rx: 20, ry: 16 },
  { code: "elbow_l", cx: 25, cy: 96, rx: 8, ry: 9 },
  { code: "elbow_r", cx: 95, cy: 96, rx: 8, ry: 9 },
  { code: "lower_back", cx: 60, cy: 105, rx: 17, ry: 13 },
  { code: "wrist_l", cx: 19, cy: 130, rx: 7, ry: 8 },
  { code: "wrist_r", cx: 101, cy: 130, rx: 7, ry: 8 },
  { code: "hip_l", cx: 47, cy: 132, rx: 12, ry: 11 },
  { code: "hip_r", cx: 73, cy: 132, rx: 12, ry: 11 },
  { code: "knee_l", cx: 47, cy: 182, rx: 10, ry: 11 },
  { code: "knee_r", cx: 73, cy: 182, rx: 10, ry: 11 },
  { code: "ankle_l", cx: 47, cy: 232, rx: 9, ry: 9 },
  { code: "ankle_r", cx: 73, cy: 232, rx: 9, ry: 9 },
];

const SILHOUETTE =
  "M60 18 a10 10 0 1 1 0 20 a10 10 0 1 1 0 -20 " +
  "M60 40 L38 48 L22 100 L16 134 L26 138 L42 96 L42 140 " +
  "L38 190 L40 244 L54 244 L58 190 L60 160 L62 190 L66 244 L80 244 " +
  "L82 190 L78 140 L78 96 L94 138 L104 134 L98 100 L82 48 Z";

export function BodyMap({
  parts,
  selected,
  onSelect,
}: {
  parts: BodyPartOption[];
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  const [view, setView] = useState<"front" | "back">("front");
  const zones = view === "front" ? FRONT : BACK;
  const byCode = new Map(parts.map((part) => [part.code, part]));

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "center" }}>
        <button
          type="button"
          className="chip chip--sm"
          aria-pressed={view === "front"}
          onClick={() => setView("front")}
        >
          спереди
        </button>
        <button
          type="button"
          className="chip chip--sm"
          aria-pressed={view === "back"}
          onClick={() => setView("back")}
        >
          сзади
        </button>
      </div>

      <svg
        viewBox="0 0 120 260"
        style={{ width: "100%", maxWidth: 240, margin: "0 auto", display: "block" }}
        role="group"
        aria-label={`Карта тела, вид ${view === "front" ? "спереди" : "сзади"}`}
      >
        <path d={SILHOUETTE} fill="var(--color-surface-sunken)" stroke="var(--color-border)" />
        {zones.map((zone) => {
          const part = byCode.get(zone.code);
          if (!part) return null;
          const active = selected === zone.code;
          return (
            <ellipse
              key={`${view}-${zone.code}`}
              cx={zone.cx}
              cy={zone.cy}
              rx={zone.rx}
              ry={zone.ry}
              fill={active ? "var(--color-accent)" : "transparent"}
              stroke={active ? "var(--color-accent)" : "var(--color-border-strong)"}
              strokeWidth={active ? 2 : 1}
              style={{ cursor: "pointer" }}
              role="button"
              tabIndex={0}
              aria-label={part.name_ru}
              aria-pressed={active}
              onClick={() => onSelect(zone.code)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(zone.code);
              }}
            />
          );
        })}
      </svg>

      <p className="muted" style={{ textAlign: "center" }}>
        {selected ? byCode.get(selected)?.name_ru : "Выбери зону тапом"}
      </p>
    </div>
  );
}
