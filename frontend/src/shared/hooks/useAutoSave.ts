import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Автосохранение поля: по паузе в наборе и по потере фокуса.
 * Кнопки «Сохранить» в приложении нет нигде.
 */
export function useAutoSave<T>(
  initial: T,
  save: (value: T) => void | Promise<void>,
  delayMs = 800,
) {
  const [value, setValue] = useState<T>(initial);
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(initial);
  const savedRef = useRef(initial);

  useEffect(() => {
    setValue(initial);
    latest.current = initial;
    savedRef.current = initial;
  }, [initial]);

  const commit = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (latest.current === savedRef.current) return;
    setSaving(true);
    try {
      await save(latest.current);
      savedRef.current = latest.current;
    } finally {
      setSaving(false);
    }
  }, [save]);

  const change = useCallback(
    (next: T) => {
      setValue(next);
      latest.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void commit(), delayMs);
    },
    [commit, delayMs],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { value, change, commit, saving };
}
