import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import { Button, Notice, Scale } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";
import { BodyMap, type BodyPartOption } from "./BodyMap";

const CHARACTERS = [
  { code: "sharp", label: "острая" },
  { code: "dull", label: "тупая" },
  { code: "ache", label: "ноющая" },
  { code: "numbness", label: "онемение" },
  { code: "stiffness", label: "скованность" },
];

interface CreatedInjury {
  id: number;
  recurrence_notice: { message: string } | null;
  affected_exercises: { exercise_name: string; level: string }[];
}

/** Ввод травмы: зона тапом по карте, интенсивность кнопками, причина текстом. */
export function InjurySheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: parts } = useList<BodyPartOption>(["body-parts"], "/catalog/body-parts/");
  const [code, setCode] = useState<string | null>(null);
  const [side, setSide] = useState("na");
  const [character, setCharacter] = useState("ache");
  const [severity, setSeverity] = useState<number | null>(5);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<CreatedInjury | null>(null);

  const save = async () => {
    const part = parts?.find((item) => item.code === code);
    if (!part) return;
    const created = await api.post<CreatedInjury>("/injuries/", {
      body_part: part.id,
      side,
      character,
      started_on: new Date().toISOString().slice(0, 10),
      initial_severity: severity ?? 5,
      notes,
    });
    setResult(created);
    onSaved();
  };

  const close = () => {
    setResult(null);
    setCode(null);
    setNotes("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Отметить травму">
      {result ? (
        <div className="stack">
          {result.recurrence_notice && <Notice>{result.recurrence_notice.message}</Notice>}
          <p className="muted">
            Помечены как «осторожно» {result.affected_exercises.length} упражнений:
          </p>
          <ul className="list">
            {result.affected_exercises.slice(0, 8).map((item) => (
              <li key={item.exercise_name} className="list__item">
                <span className="grow">{item.exercise_name}</span>
                <span className="tiny">
                  {item.level === "avoid" ? "лучше исключить" : "осторожно"}
                </span>
              </li>
            ))}
          </ul>
          <Button variant="primary" size="lg" onClick={close}>
            Понятно
          </Button>
        </div>
      ) : (
        <div className="stack">
          <BodyMap parts={parts ?? []} selected={code} onSelect={setCode} />

          <div className="row row--wrap">
            {[
              { value: "left", label: "левая" },
              { value: "right", label: "правая" },
              { value: "both", label: "обе" },
              { value: "na", label: "не важно" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className="chip chip--sm"
                aria-pressed={side === option.value}
                onClick={() => setSide(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="row row--wrap">
            {CHARACTERS.map((option) => (
              <button
                key={option.code}
                type="button"
                className="chip chip--sm"
                aria-pressed={character === option.code}
                onClick={() => setCharacter(option.code)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Десять кнопок, а не слайдер: слайдер обещает точность, которой нет. */}
          <Scale label="Интенсивность" max={10} value={severity} onChange={setSeverity} />

          <label className="field">
            <span className="field__label">Что произошло</span>
            <textarea
              rows={2}
              value={notes}
              placeholder="Например: заболело после разведений, резко добавил вес"
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <Button variant="primary" size="lg" disabled={!code} onClick={() => void save()}>
            Сохранить
          </Button>
        </div>
      )}
    </Sheet>
  );
}
