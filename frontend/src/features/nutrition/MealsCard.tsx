import { useRef, useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import { Button, Card, Chip, Empty, Notice } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

interface FoodItem {
  id: number;
  name: string;
  protein_g: string;
}

interface MealTemplate {
  id: number;
  name: string;
  default_meal_type: string;
  total_protein_g: number;
  items: { id: number; food_name: string; quantity: string; protein_g: string }[];
}

const MEAL_TYPES = [
  { code: "breakfast", label: "завтрак" },
  { code: "lunch", label: "обед" },
  { code: "dinner", label: "ужин" },
  { code: "snack", label: "перекус" },
];

/**
 * Шаблоны приёмов пищи и фото еды.
 *
 * «Мой обычный завтрак» — одна кнопка вместо пяти полей. Фото
 * сохраняется без обязательного анализа: это просто память,
 * а не заявка на подсчёт калорий.
 */
export function MealsCard() {
  const templates = useList<MealTemplate>(["meal-templates"], "/nutrition/meal-templates/");
  const foods = useList<FoodItem>(["foods", "all"], "/nutrition/foods/", { page_size: 60 });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState("breakfast");
  const [picked, setPicked] = useState<number[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const apply = async (template: MealTemplate) => {
    await api.post(`/nutrition/meal-templates/${template.id}/apply/`, {});
    setStatus(`${template.name}: +${template.total_protein_g.toFixed(0)} г белка`);
    window.setTimeout(() => setStatus(null), 3000);
  };

  const create = async () => {
    if (!name.trim() || picked.length === 0) return;
    await api.post<MealTemplate>("/nutrition/meal-templates/", {
      name,
      default_meal_type: mealType,
      items: picked.map((foodId) => ({ food_item: foodId, quantity: 1 })),
    });
    setName("");
    setPicked([]);
    setCreating(false);
    await templates.refetch();
  };

  const addPhoto = async (file: File) => {
    const form = new FormData();
    form.append("at", new Date().toISOString());
    form.append("meal_type", "snack");
    form.append("source", "photo_only");
    form.append("photo", file);
    await api.post("/nutrition/meals/", form);
    setStatus("Фото сохранено. Без цифр — просто память.");
    window.setTimeout(() => setStatus(null), 3000);
  };

  return (
    <Card
      title="Приёмы пищи"
      action={
        <button type="button" className="card__action" onClick={() => setCreating(true)}>
          Шаблон
        </button>
      }
    >
      {templates.data?.length ? (
        <div className="row row--wrap">
          {templates.data.map((template) => (
            <Chip key={template.id} onClick={() => void apply(template)}>
              {template.name} · {template.total_protein_g.toFixed(0)} г
            </Chip>
          ))}
        </div>
      ) : (
        <Empty>Шаблонов нет. «Мой обычный завтрак» экономит пять полей каждый день.</Empty>
      )}

      <div className="row" style={{ marginTop: "var(--space-3)" }}>
        <Button onClick={() => photoRef.current?.click()}>Фото еды</Button>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void addPhoto(file);
          }}
        />
      </div>

      {status && (
        <p className="tiny" style={{ marginTop: "var(--space-2)" }}>
          {status}
        </p>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="Шаблон приёма">
        <div className="stack">
          <label className="field">
            <span className="field__label">Название</span>
            <input
              value={name}
              placeholder="Мой обычный завтрак"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="row row--wrap">
            {MEAL_TYPES.map((type) => (
              <Chip
                key={type.code}
                small
                pressed={mealType === type.code}
                onClick={() => setMealType(type.code)}
              >
                {type.label}
              </Chip>
            ))}
          </div>

          <div>
            <span className="field__label">Что входит</span>
            <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
              {(foods.data ?? []).slice(0, 24).map((food) => (
                <Chip
                  key={food.id}
                  small
                  pressed={picked.includes(food.id)}
                  onClick={() =>
                    setPicked(
                      picked.includes(food.id)
                        ? picked.filter((id) => id !== food.id)
                        : [...picked, food.id],
                    )
                  }
                >
                  {food.name.split(",")[0]}
                </Chip>
              ))}
            </div>
          </div>

          <Notice tone="info">
            Потом это будет одна кнопка на экране «Сегодня».
          </Notice>

          <Button variant="primary" size="lg" onClick={() => void create()}>
            Сохранить шаблон
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}
