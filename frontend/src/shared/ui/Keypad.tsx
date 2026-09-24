import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { haptic } from "../hooks/useHaptics";
import { Icon } from "./icons";
import { Button } from "./primitives";
import { Sheet } from "./Sheet";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

/**
 * Ввод числа своей клавиатурой в нижнем листе.
 *
 * Системная клавиатура закрывает пол-экрана и на iOS не всегда даёт
 * десятичную точку. Здесь цифры крупные, под большим пальцем, а прошлое
 * значение видно рядом — сверяться не нужно. Клавиатура тоже работает:
 * на десктопе число просто набирается.
 */
export function KeypadSheet({
  open,
  onClose,
  title,
  unit,
  hint,
  initial = "",
  decimal = true,
  maxLength = 6,
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  unit?: string;
  hint?: ReactNode;
  initial?: string;
  decimal?: boolean;
  maxLength?: number;
  onSubmit: (value: string) => void;
  /** Дополнительные элементы между табло и клавишами — например, условия. */
  children?: ReactNode;
}) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  const press = (key: string) => {
    haptic("tap");
    setValue((current) => {
      if (key === "back") return current.slice(0, -1);
      if (key === ".") {
        if (!decimal || current.includes(".")) return current;
        return current === "" ? "0." : `${current}.`;
      }
      if (current.length >= maxLength) return current;
      if (current === "0") return key;
      return current + key;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === "." || event.key === ",") press(".");
      else if (event.key === "Backspace") press("back");
      else if (event.key === "Enter" && value) submit();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const submit = () => {
    if (!value || value === "0.") return;
    onSubmit(value.replace(/\.$/, ""));
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="keypad-display" aria-live="polite">
        <span className="keypad-display__value">
          {value || <span style={{ color: "var(--color-text-muted)" }}>0</span>}
          <span className="keypad-display__caret" aria-hidden="true" />
          {unit && <span className="unit"> {unit}</span>}
        </span>
        {hint && <span className="tiny">{hint}</span>}
      </div>

      {children}

      <div className="keypad" role="group" aria-label="Цифровая клавиатура">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="keypad__key"
            aria-label={key === "back" ? "Стереть" : key === "." ? "Точка" : key}
            disabled={key === "." && !decimal}
            onClick={() => press(key)}
          >
            {key === "back" ? <Icon name="chevronLeft" size={22} /> : key === "." ? "," : key}
          </button>
        ))}
      </div>

      <div style={{ marginTop: "var(--space-3)" }}>
        <Button variant="primary" size="lg" disabled={!value} onClick={submit}>
          Готово
        </Button>
      </div>
    </Sheet>
  );
}
