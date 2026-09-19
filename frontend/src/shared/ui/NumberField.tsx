import { useEffect, useRef, useState } from "react";

/**
 * Крупный ввод числа.
 *
 * Требования, из-за которых компонент существует:
 *  - один тап открывает системную цифровую клавиатуру (`inputMode`);
 *  - прошлое значение стоит плейсхолдером, а не заполняет поле — иначе
 *    придётся его стирать;
 *  - сохранение автоматическое: по паузе и по потере фокуса. Кнопки
 *    «Сохранить» нет;
 *  - шрифт не меньше 16px, иначе Safari зумит страницу при фокусе
 *    (об этом заботится .number-input в токенах).
 */
export function NumberField({
  value,
  placeholder,
  suffix,
  decimal = true,
  onCommit,
  autoFocus,
  ariaLabel,
  delayMs = 800,
}: {
  value: string;
  placeholder?: string | null;
  suffix?: string;
  decimal?: boolean;
  onCommit: (value: string) => void;
  autoFocus?: boolean;
  ariaLabel: string;
  delayMs?: number;
}) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  const committed = useRef(value);

  useEffect(() => {
    setDraft(value);
    committed.current = value;
  }, [value]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (next: string) => {
    window.clearTimeout(timer.current);
    const normalized = next.replace(",", ".").trim();
    if (normalized === committed.current || normalized === "") return;
    committed.current = normalized;
    onCommit(normalized);
  };

  return (
    <div className="row" style={{ justifyContent: "center", gap: "var(--space-2)" }}>
      <input
        className="number-input"
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        pattern={decimal ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
        enterKeyHint="done"
        autoComplete="off"
        aria-label={ariaLabel}
        value={draft}
        placeholder={placeholder ?? ""}
        autoFocus={autoFocus}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d.,]/g, "");
          setDraft(next);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => commit(next), delayMs);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit(draft);
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
      {suffix && <span className="muted">{suffix}</span>}
    </div>
  );
}
