import { useState } from "react";

import { api } from "../../shared/api/client";
import { Button, Notice } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

const FIELDS = [
  { code: "weight_kg", label: "Вес, кг" },
  { code: "body_fat_pct", label: "Жир, %" },
  { code: "body_fat_kg", label: "Жир, кг" },
  { code: "skeletal_muscle_kg", label: "Скелетная мышечная масса, кг" },
  { code: "total_water_l", label: "Общая вода, л" },
  { code: "intracellular_water_l", label: "Внутриклеточная вода, л" },
  { code: "extracellular_water_l", label: "Внеклеточная вода, л" },
  { code: "protein_kg", label: "Белок, кг" },
  { code: "minerals_kg", label: "Минералы, кг" },
  { code: "visceral_fat_level", label: "Висцеральный жир" },
  { code: "bmr_kcal", label: "Базальный метаболизм, ккал" },
  { code: "score", label: "Балл" },
];

const SEGMENTS = [
  { code: "arm_l", label: "Рука левая" },
  { code: "arm_r", label: "Рука правая" },
  { code: "trunk", label: "Туловище" },
  { code: "leg_l", label: "Нога левая" },
  { code: "leg_r", label: "Нога правая" },
];

/** Ввод данных анализатора состава тела (InBody и аналоги) + фото листка. */
export function ScanSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [segments, setSegments] = useState<Record<string, { lean: string; fat: string }>>({});
  const [photo, setPhoto] = useState<File | null>(null);

  const save = async () => {
    const payload: Record<string, unknown> = { at: new Date().toISOString(), device: "InBody" };
    for (const [key, value] of Object.entries(values)) {
      if (value.trim()) payload[key] = value.replace(",", ".");
    }
    payload.segments = SEGMENTS.filter(
      (segment) => segments[segment.code]?.lean || segments[segment.code]?.fat,
    ).map((segment) => ({
      segment: segment.code,
      lean_mass_kg: segments[segment.code]?.lean?.replace(",", ".") || null,
      fat_mass_kg: segments[segment.code]?.fat?.replace(",", ".") || null,
    }));

    const created = await api.post<{ id: number }>("/body/scans/", payload);

    if (photo) {
      const form = new FormData();
      form.append("photo", photo);
      await api.patch(`/body/scans/${created.id}/`, form);
    }
    setValues({});
    setSegments({});
    setPhoto(null);
    onSaved();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Анализ состава тела">
      <Notice tone="info">
        Прирост «мышечной массы» между замерами частично объясняется водой
        и гликогеном. Сравнимы только замеры в одинаковых условиях: одно
        время дня, до тренировки.
      </Notice>

      <div className="stack" style={{ marginTop: "var(--space-3)" }}>
        {FIELDS.map((field) => (
          <label key={field.code} className="field">
            <span className="field__label">{field.label}</span>
            <input
              inputMode="decimal"
              value={values[field.code] ?? ""}
              onChange={(event) =>
                setValues({ ...values, [field.code]: event.target.value.replace(/[^\d.,]/g, "") })
              }
            />
          </label>
        ))}

        <h3 className="card__title" style={{ marginTop: "var(--space-3)" }}>
          Сегменты: тощая масса и жир
        </h3>
        {SEGMENTS.map((segment) => (
          <div key={segment.code} className="row" style={{ gap: "var(--space-2)" }}>
            <span className="grow">{segment.label}</span>
            <input
              inputMode="decimal"
              placeholder="тощая"
              style={{ width: 90 }}
              value={segments[segment.code]?.lean ?? ""}
              onChange={(event) =>
                setSegments({
                  ...segments,
                  [segment.code]: {
                    lean: event.target.value.replace(/[^\d.,]/g, ""),
                    fat: segments[segment.code]?.fat ?? "",
                  },
                })
              }
            />
            <input
              inputMode="decimal"
              placeholder="жир"
              style={{ width: 90 }}
              value={segments[segment.code]?.fat ?? ""}
              onChange={(event) =>
                setSegments({
                  ...segments,
                  [segment.code]: {
                    lean: segments[segment.code]?.lean ?? "",
                    fat: event.target.value.replace(/[^\d.,]/g, ""),
                  },
                })
              }
            />
          </div>
        ))}

        <label className="field">
          <span className="field__label">Фото листка</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
          />
        </label>

        <Button variant="primary" size="lg" onClick={() => void save()}>
          Сохранить
        </Button>
      </div>
    </Sheet>
  );
}
