import { useState } from "react";

import { api } from "../../../shared/api/client";
import type { TodayPayload } from "../../../shared/api/types";
import { Icon } from "../../../shared/ui/icons";
import { withPlural } from "../../../shared/ui/plural";
import { Button, Card } from "../../../shared/ui/primitives";
import { Sheet } from "../../../shared/ui/Sheet";
import { SosSheet } from "../../habits/SosSheet";

/**
 * Компактные счётчики привычек.
 *
 * Показываются обе цифры: «дней с решения» не обнуляется никогда,
 * «текущая серия» начинается заново после срыва. Чем больше первое
 * число, тем страшнее его потерять — поэтому его и не отнимают.
 */
export function HabitsBlock({
  habits,
  onChanged,
}: {
  habits: TodayPayload["habits"];
  onChanged: () => void;
}) {
  const [sosOpen, setSosOpen] = useState(false);
  const [episodeFor, setEpisodeFor] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const logEpisode = async () => {
    if (episodeFor === null) return;
    await api.post(`/habits/${episodeFor}/episode/`, { note });
    setEpisodeFor(null);
    setNote("");
    onChanged();
  };

  if (habits.length === 0) return null;

  return (
    <Card
      title="Привычки"
      icon="leaf"
      tone="teal"
      action={
        <button type="button" className="card__action" onClick={() => setSosOpen(true)}>
          <Icon name="sos" size={16} /> SOS
        </button>
      }
    >
      <div className="list">
        {habits.map((habit) => (
          <div key={habit.id} className="list__item" style={{ padding: "var(--space-2) 0" }}>
            <span className="grow">
              <span className="strong">{habit.name}</span>
              <br />
              <span className="tiny" title="дней с решения — не обнуляется">
                {withPlural(habit.days_since_decision, "день", "дня", "дней")} с решения
              </span>
            </span>
            <span className="badge tone-teal" title="текущая серия">
              <Icon name="flame" size={12} /> {habit.current_streak}
            </span>
            <button
              type="button"
              className="chip chip--sm"
              onClick={() => setEpisodeFor(habit.id)}
              aria-label={`Отметить эпизод: ${habit.name}`}
            >
              отметить
            </button>
          </div>
        ))}
      </div>

      <Sheet
        open={episodeFor !== null}
        onClose={() => setEpisodeFor(null)}
        title="Отметить эпизод"
      >
        <p className="muted">
          Накопленные дни остаются с тобой — обнулится только текущая серия.
          Если хочешь, напиши что случилось: это пополнит карту триггеров.
        </p>
        <label className="field" style={{ marginTop: "var(--space-3)" }}>
          <span className="field__label">Что случилось (необязательно)</span>
          <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className="row" style={{ marginTop: "var(--space-3)" }}>
          <Button variant="primary" size="lg" onClick={() => void logEpisode()}>
            Отметить
          </Button>
        </div>
      </Sheet>

      <SosSheet open={sosOpen} onClose={() => setSosOpen(false)} />
    </Card>
  );
}
