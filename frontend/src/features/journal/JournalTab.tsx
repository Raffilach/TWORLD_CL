import { useState } from "react";

import { useAuth } from "../../app/auth";
import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import { Button, Card, Chip, Empty, Notice } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";
import { PinGate } from "./PinGate";
import { VoiceRecorder } from "./VoiceRecorder";

interface JournalEntry {
  id: number;
  date: string;
  at: string;
  text: string;
  tags: number[];
  answers: { id: number; question: string; text: string }[];
}

interface LifeEvent {
  id: number;
  date_from: string;
  date_to: string | null;
  kind: string;
  kind_label: string;
  title: string;
  show_on_charts: boolean;
}

const QUESTIONS = [
  { code: "went_well", label: "Что получилось" },
  { code: "was_hard", label: "Что было тяжело" },
  { code: "proud_of", label: "Чем горжусь" },
];

const EVENT_KINDS = [
  { code: "injury", label: "травма" },
  { code: "trip", label: "поездка" },
  { code: "illness", label: "болезнь" },
  { code: "exam", label: "экзамен" },
  { code: "move", label: "переезд" },
  { code: "other", label: "другое" },
];

/**
 * Дневник.
 *
 * Свободная запись без обязательных полей: быстрые вопросы — подсказки,
 * а не форма. Метки событий появляются вертикальными линиями на всех
 * графиках — провал получает объяснение вместо самобичевания.
 */
export function JournalTab() {
  const { settings } = useAuth();
  const [unlocked, setUnlocked] = useState(!settings?.diary_lock_enabled);
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [eventOpen, setEventOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventKind, setEventKind] = useState("other");
  const [saved, setSaved] = useState(false);
  const [lastEntryId, setLastEntryId] = useState<number | null>(null);

  const entries = useList<JournalEntry>(["journal"], "/journal/entries/", { page_size: 30 }, unlocked);
  const events = useList<LifeEvent>(["life-events"], "/journal/events/", undefined, unlocked);

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  const save = async () => {
    const filled = Object.entries(answers).filter(([, value]) => value.trim());
    if (!text.trim() && filled.length === 0) return;
    const now = new Date();
    const created = await api.post<{ id: number }>("/journal/entries/", {
      date: now.toISOString().slice(0, 10),
      at: now.toISOString(),
      text,
      answers: filled.map(([question, value]) => ({ question, text: value })),
    });
    setLastEntryId(created.id);
    setText("");
    setAnswers({});
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
    await entries.refetch();
  };

  const addEvent = async () => {
    if (!eventTitle.trim()) return;
    await api.post("/journal/events/", {
      date_from: new Date().toISOString().slice(0, 10),
      kind: eventKind,
      title: eventTitle,
    });
    setEventTitle("");
    setEventOpen(false);
    await events.refetch();
  };

  return (
    <>
      <Card title="Запись">
        <textarea
          rows={4}
          value={text}
          placeholder="Без обязательных полей — пиши как есть"
          onChange={(event) => setText(event.target.value)}
        />
        <div className="stack stack--tight" style={{ marginTop: "var(--space-3)" }}>
          {QUESTIONS.map((question) => (
            <label key={question.code} className="field">
              <span className="field__label">{question.label}</span>
              <input
                value={answers[question.code] ?? ""}
                onChange={(event) =>
                  setAnswers({ ...answers, [question.code]: event.target.value })
                }
              />
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: "var(--space-3)" }}>
          <Button variant="primary" size="lg" onClick={() => void save()}>
            Сохранить запись
          </Button>
        </div>
        {saved && <p className="tiny" style={{ marginTop: "var(--space-2)" }}>Записано.</p>}

        {lastEntryId !== null && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <VoiceRecorder entryId={lastEntryId} onSaved={() => void entries.refetch()} />
            <p className="tiny">
              Добавится к последней записи. Расшифровка появится, если она
              настроена на сервере.
            </p>
          </div>
        )}
      </Card>

      <Card
        title="Метки событий"
        action={
          <button type="button" className="card__action" onClick={() => setEventOpen(true)}>
            Добавить
          </button>
        }
      >
        <p className="tiny" style={{ marginBottom: "var(--space-2)" }}>
          Появляются вертикальными линиями на всех графиках — чтобы провал
          в цифрах был объяснён, а не выглядел виной.
        </p>
        {events.data?.length ? (
          <ul className="list">
            {events.data.map((event) => (
              <li key={event.id} className="list__item">
                <span className="grow">
                  {event.title}
                  <br />
                  <span className="tiny">
                    {event.kind_label} · {event.date_from}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Меток пока нет.</Empty>
        )}
      </Card>

      <Card title="История">
        {entries.data?.length ? (
          <ul className="list">
            {entries.data.map((entry) => (
              <li key={entry.id} className="list__item">
                <span className="grow">
                  <span className="tiny">{entry.date}</span>
                  <br />
                  {entry.text}
                  {entry.answers.map((answer) => (
                    <span key={answer.id} className="tiny">
                      <br />
                      {QUESTIONS.find((q) => q.code === answer.question)?.label}: {answer.text}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Записей пока нет.</Empty>
        )}
      </Card>

      <Sheet open={eventOpen} onClose={() => setEventOpen(false)} title="Значимое событие">
        <div className="stack">
          <div className="row row--wrap">
            {EVENT_KINDS.map((kind) => (
              <Chip
                key={kind.code}
                small
                pressed={eventKind === kind.code}
                onClick={() => setEventKind(kind.code)}
              >
                {kind.label}
              </Chip>
            ))}
          </div>
          <label className="field">
            <span className="field__label">Что случилось</span>
            <input
              value={eventTitle}
              placeholder="Командировка"
              onChange={(event) => setEventTitle(event.target.value)}
            />
          </label>
          <Button variant="primary" size="lg" onClick={() => void addEvent()}>
            Добавить
          </Button>
        </div>
      </Sheet>

      {settings?.diary_lock_enabled && (
        <Notice tone="info">
          Дневник закрыт пин-кодом и не попадает в выгрузку для ИИ без явного согласия.
        </Notice>
      )}
    </>
  );
}
