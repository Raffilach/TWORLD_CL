import { haptic } from "../hooks/useHaptics";

/**
 * Шаг веса по фактической сетке тренажёра.
 *
 * Тренажёры дают нестандартную шкалу — 36,2 / 40,8 / 45,3 / 49,8 кг.
 * Кнопки +/− ходят по этому массиву, а не прибавляют условные 2,5 кг.
 * Долгий тап открывает весь список — чтобы прыгнуть сразу.
 */
export function WeightStepper({
  value,
  steps,
  fallbackStep = 2.5,
  onChange,
  onPickFromList,
  unitLabel = "кг",
}: {
  value: number | null;
  steps: number[];
  fallbackStep?: number;
  onChange: (value: number) => void;
  onPickFromList?: () => void;
  unitLabel?: string;
}) {
  const sorted = [...steps].sort((a, b) => a - b);

  const move = (direction: 1 | -1) => {
    haptic("tap");
    if (sorted.length === 0) {
      const base = value ?? 0;
      onChange(Math.max(0, Number((base + fallbackStep * direction).toFixed(2))));
      return;
    }
    if (value === null) {
      onChange(sorted[0]);
      return;
    }
    const next =
      direction > 0
        ? (sorted.find((step) => step > value) ?? sorted[sorted.length - 1])
        : ([...sorted].reverse().find((step) => step < value) ?? sorted[0]);
    onChange(next);
  };

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__btn"
        onClick={() => move(-1)}
        aria-label={`Уменьшить вес на шаг сетки`}
      >
        −
      </button>
      <button
        type="button"
        className="stepper__value"
        onClick={onPickFromList}
        aria-label="Выбрать вес из сетки тренажёра"
      >
        {value ?? "—"} <span className="muted">{unitLabel}</span>
      </button>
      <button
        type="button"
        className="stepper__btn"
        onClick={() => move(1)}
        aria-label="Увеличить вес на шаг сетки"
      >
        +
      </button>
    </div>
  );
}

export function CountStepper({
  value,
  onChange,
  min = 0,
  max = 100,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper__btn"
        onClick={() => {
          haptic("tap");
          onChange(Math.max(min, value - 1));
        }}
        aria-label={`${label}: меньше`}
      >
        −
      </button>
      <span className="stepper__value">{value}</span>
      <button
        type="button"
        className="stepper__btn"
        onClick={() => {
          haptic("tap");
          onChange(Math.min(max, value + 1));
        }}
        aria-label={`${label}: больше`}
      >
        +
      </button>
    </div>
  );
}
