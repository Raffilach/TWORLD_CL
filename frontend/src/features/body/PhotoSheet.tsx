import { useState } from "react";

import { api } from "../../shared/api/client";
import { Button, Chip, Notice } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

const POSES = [
  { code: "front", label: "спереди" },
  { code: "side", label: "сбоку" },
  { code: "back", label: "сзади" },
];

/**
 * Прогресс-фото.
 *
 * Ракурс сохраняется вместе со снимком, а поверх камеры показывается
 * контур: без одинакового ракурса сравнение «до/после» ничего не значит.
 */
export function PhotoSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pose, setPose] = useState("front");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const save = async () => {
    if (!file) return;
    const form = new FormData();
    form.append("date", new Date().toISOString().slice(0, 10));
    form.append("pose", pose);
    form.append("photo", file);
    form.append("outline_used", "true");
    await api.post("/body/photos/", form);
    setFile(null);
    setPreview(null);
    onSaved();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Прогресс-фото">
      <div className="row row--wrap">
        {POSES.map((item) => (
          <Chip key={item.code} small pressed={pose === item.code} onClick={() => setPose(item.code)}>
            {item.label}
          </Chip>
        ))}
      </div>

      <div style={{ position: "relative", marginTop: "var(--space-3)" }}>
        {preview ? (
          <img
            src={preview}
            alt="Предпросмотр"
            style={{ width: "100%", borderRadius: "var(--radius-md)" }}
          />
        ) : (
          <div
            style={{
              aspectRatio: "3 / 4",
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface-sunken)",
            }}
          />
        )}
        {/* Шаблон-контур: помогает встать так же, как в прошлый раз. */}
        <svg
          viewBox="0 0 120 160"
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.45 }}
        >
          <ellipse cx="60" cy="24" rx="12" ry="14" fill="none" stroke="var(--color-border-strong)" strokeDasharray="4 4" />
          <path
            d="M48 40 L72 40 L78 90 L70 150 L60 150 L60 100 L60 150 L50 150 L42 90 Z"
            fill="none"
            stroke="var(--color-border-strong)"
            strokeDasharray="4 4"
          />
        </svg>
      </div>

      <label className="field" style={{ marginTop: "var(--space-3)" }}>
        <span className="field__label">Снимок</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            setPreview(selected ? URL.createObjectURL(selected) : null);
          }}
        />
      </label>

      <Notice tone="info">
        Фото хранится только у тебя и не попадает ни в отчёты, ни в выгрузку для ИИ.
      </Notice>

      <div style={{ marginTop: "var(--space-3)" }}>
        <Button variant="primary" size="lg" disabled={!file} onClick={() => void save()}>
          Сохранить
        </Button>
      </div>
    </Sheet>
  );
}
