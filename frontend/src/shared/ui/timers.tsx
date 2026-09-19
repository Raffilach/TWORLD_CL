import { useCallback, useEffect, useRef, useState } from "react";

import { haptic } from "../hooks/useHaptics";

/**
 * Таймеры считают по стенным часам, а не по тикам.
 *
 * Вкладка усыплена, экран заблокирован, телефон в кармане — при возврате
 * значение остаётся верным, потому что хранится момент старта,
 * а не накопленный счётчик.
 */
function useWallClock(startedAt: number | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running || startedAt === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 200);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running, startedAt]);

  if (startedAt === null) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** 85 → «1:25». Подсказка под полем ручного ввода секунд. */
export function secondsHint(value: string): string | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 60) return null;
  return `${seconds} = ${formatClock(seconds)}`;
}

/**
 * Таймер отдыха. Стартует автоматически после записи подхода.
 *
 * Уведомление ставится через Notification API: на iOS звук при полностью
 * заблокированном экране гарантировать нельзя, поэтому по возвращении
 * в приложение значение всё равно верное, а вибрация срабатывает там,
 * где поддерживается.
 */
export function RestTimer({
  seconds,
  startedAt,
  onAdd,
  onSkip,
}: {
  seconds: number;
  startedAt: number;
  onAdd: (extraSeconds: number) => void;
  onSkip: () => void;
}) {
  const elapsed = useWallClock(startedAt, true);
  const left = Math.max(0, seconds - elapsed);
  const fired = useRef(false);

  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      haptic("success");
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Отдых закончился", { body: "Следующий подход", silent: false });
        }
      } catch {
        /* уведомления запрещены — не мешаем тренировке */
      }
    }
    if (left > 0) fired.current = false;
  }, [left]);

  return (
    <div className="rest-timer">
      <strong className="mono" style={{ fontSize: "var(--font-size-xl)" }}>
        {formatClock(left)}
      </strong>
      <div className="grow">
        <div className="progress">
          <div
            className="progress__fill"
            style={{ width: `${seconds > 0 ? ((seconds - left) / seconds) * 100 : 100}%` }}
          />
        </div>
        <span className="tiny">Отдых</span>
      </div>
      <button type="button" className="btn" onClick={() => onAdd(30)}>
        +30 с
      </button>
      <button type="button" className="btn btn--ghost" onClick={onSkip}>
        Пропустить
      </button>
    </div>
  );
}

/**
 * Секундомер статики: планка, вис, удержание.
 *
 * «Зафиксировать» создаёт отдельную попытку и НЕ обнуляет счёт — именно
 * на этом раньше в базу попадало «0,44 секунды» вместо 44. Сброс — только
 * отдельной явной кнопкой. Результат всегда целые секунды.
 */
export function Stopwatch({
  onRecord,
  minSeconds = 2,
}: {
  onRecord: (seconds: number) => void;
  minSeconds?: number;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [frozen, setFrozen] = useState(0);
  const [confirm, setConfirm] = useState<number | null>(null);
  const running = startedAt !== null;
  const live = useWallClock(startedAt, running);
  const elapsed = running ? frozen + live : frozen;

  const record = useCallback(
    (seconds: number) => {
      if (seconds < minSeconds) {
        // Случайный двойной тап не должен записать «0 секунд».
        setConfirm(seconds);
        return;
      }
      haptic("success");
      onRecord(seconds);
    },
    [minSeconds, onRecord],
  );

  return (
    <div className="stack">
      <output className="timer-display">{formatClock(elapsed)}</output>

      <div className="row" style={{ gap: "var(--space-2)" }}>
        {!running ? (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => {
              haptic("tap");
              setStartedAt(Date.now());
            }}
          >
            {frozen > 0 ? "Продолжить" : "Старт"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => record(elapsed)}
            >
              Зафиксировать
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setFrozen(elapsed);
                setStartedAt(null);
              }}
            >
              Пауза
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setStartedAt(null);
            setFrozen(0);
          }}
          aria-label="Сбросить секундомер"
        >
          Сброс
        </button>
      </div>

      {confirm !== null && (
        <div className="notice">
          <div className="row row--between">
            <span>Записать {confirm} с?</span>
            <span className="row">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onRecord(confirm);
                  setConfirm(null);
                }}
              >
                Да
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)}>
                Нет
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Секундомер самой тренировки: автостарт по первому подходу. */
export function SessionClock({ startedAt }: { startedAt: string | null }) {
  const start = startedAt ? new Date(startedAt).getTime() : null;
  const elapsed = useWallClock(start, start !== null);
  if (start === null) return null;
  return <span className="mono">{formatClock(elapsed)}</span>;
}
