import { useState } from "react";

import { api } from "../../shared/api/client";
import { Button, Notice } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

const SITES = [
  { code: "waist", label: "Талия", hint: "показывает прогресс раньше весов" },
  { code: "chest", label: "Грудь", hint: "" },
  { code: "hips", label: "Бёдра", hint: "" },
  { code: "arm_l", label: "Рука левая", hint: "" },
  { code: "arm_r", label: "Рука правая", hint: "" },
  { code: "thigh_l", label: "Бедро левое", hint: "" },
  { code: "thigh_r", label: "Бедро правое", hint: "" },
  { code: "neck", label: "Шея", hint: "" },
  { code: "calf", label: "Икра", hint: "" },
];

/**
 * Ввод обхватов.
 *
 * Все поля на одном экране и все необязательные: измерил талию — записал
 * талию, остальное можно не трогать. Талия идёт первой не случайно.
 */
export function MeasurementSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const date = new Date().toISOString().slice(0, 10);
    const entries = Object.entries(values).filter(([, value]) => value.trim());
    for (const [site, value] of entries) {
      await api.post("/body/measurements/", {
        date,
        site,
        value_cm: value.replace(",", "."),
      });
    }
    if (entries.length > 0) {
      setValues({});
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
      onSaved();
      onClose();
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Замеры сантиметром">
      <div className="stack">
        {SITES.map((site) => (
          <label key={site.code} className="field">
            <span className="field__label">
              {site.label}
              {site.hint && <span className="tiny"> · {site.hint}</span>}
            </span>
            <input
              inputMode="decimal"
              placeholder="см"
              value={values[site.code] ?? ""}
              onChange={(event) =>
                setValues({ ...values, [site.code]: event.target.value.replace(/[^\d.,]/g, "") })
              }
            />
          </label>
        ))}
        {saved && <Notice tone="info">Записано.</Notice>}
        <Button variant="primary" size="lg" onClick={() => void save()}>
          Сохранить
        </Button>
      </div>
    </Sheet>
  );
}
