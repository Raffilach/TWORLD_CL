/**
 * Автосохранение без кнопки «Сохранить» требует отмены последнего действия:
 * иначе случайный тап ничем не исправить.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface UndoEntry {
  id: number;
  message: string;
  undo: () => void | Promise<void>;
}

interface UndoContextValue {
  push: (message: string, undo: () => void | Promise<void>) => void;
  notify: (message: string) => void;
}

const UndoContext = createContext<UndoContextValue | null>(null);
const LIFETIME_MS = 5000;

export function UndoProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<UndoEntry | null>(null);

  const push = useCallback((message: string, undo: () => void | Promise<void>) => {
    setEntry({ id: Date.now(), message, undo });
  }, []);

  const notify = useCallback((message: string) => {
    setEntry({ id: Date.now(), message, undo: () => undefined });
  }, []);

  useEffect(() => {
    if (!entry) return;
    const timer = window.setTimeout(() => setEntry(null), LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [entry]);

  const value = useMemo(() => ({ push, notify }), [push, notify]);

  return (
    <UndoContext.Provider value={value}>
      {children}
      {entry && (
        <div className="toast" role="status">
          <span>{entry.message}</span>
          <button
            type="button"
            className="toast__action"
            onClick={() => {
              void entry.undo();
              setEntry(null);
            }}
          >
            Отменить
          </button>
        </div>
      )}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const context = useContext(UndoContext);
  if (!context) throw new Error("useUndo вне UndoProvider");
  return context;
}
