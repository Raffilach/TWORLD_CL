import { useEffect, useState } from "react";

import { api } from "../../shared/api/client";
import { Button } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";
import { formatClock } from "../../shared/ui/timers";

interface SosResponse {
  session: { id: number };
  duration_seconds: number;
  message: string;
  replacements: { id: number; text: string }[];
}

/**
 * Кнопка SOS: пять минут и список заменителей.
 *
 * Таймер считает по стенным часам — можно свернуть приложение
 * и выйти на улицу, значение не собьётся.
 */
export function SosSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [session, setSession] = useState<SosResponse | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) {
      setSession(null);
      setStartedAt(null);
      return;
    }
    (async () => {
      const response = await api.post<SosResponse>("/sos/", {});
      setSession(response);
      setStartedAt(Date.now());
    })();
  }, [open]);

  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const left =
    session && startedAt
      ? Math.max(0, session.duration_seconds - Math.floor((now - startedAt) / 1000))
      : 0;

  const finish = async (outcome: "passed" | "gave_in") => {
    if (session) await api.post(`/sos/${session.session.id}/finish/`, { outcome });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Пять минут">
      <p className="timer-display">{formatClock(left)}</p>
      <p className="muted" style={{ textAlign: "center" }}>
        {session?.message ?? "Тяга проходит сама. Обычно ей хватает пяти минут."}
      </p>

      {session && session.replacements.length > 0 && (
        <ul className="list" style={{ marginTop: "var(--space-4)" }}>
          {session.replacements.map((replacement) => (
            <li key={replacement.id} className="list__item">
              {replacement.text}
            </li>
          ))}
        </ul>
      )}

      <div className="stack" style={{ marginTop: "var(--space-4)" }}>
        <Button variant="primary" size="lg" onClick={() => void finish("passed")}>
          Прошло
        </Button>
        <Button onClick={() => void finish("gave_in")}>Не удержался — отметить честно</Button>
      </div>
    </Sheet>
  );
}
