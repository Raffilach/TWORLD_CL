import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import { Button, Card, Chip, Empty, Loading, Notice } from "../../shared/ui/primitives";
import { SimpleLineChart } from "../../shared/ui/charts";
import { BarcodeScanner } from "../nutrition/BarcodeScanner";
import { MealsCard } from "../nutrition/MealsCard";

interface WeeklyExceptions {
  period: { from: string; to: string };
  items: { kind: string; label: string; count: number; estimated_sugar_g: string | null }[];
}

interface FreeMeal {
  id: number;
  planned_for: string;
  happened_on: string | null;
  note: string;
  within_limit: boolean | null;
}

const KINDS = [
  { code: "sweets", label: "сладкое", sugar: 20 },
  { code: "sugary_drink", label: "сладкий напиток", sugar: 25 },
  { code: "fastfood", label: "фастфуд", sugar: null },
  { code: "alcohol", label: "алкоголь", sugar: null },
];

/**
 * Питание: белок по дням, лог исключений и свободный приём.
 *
 * Сладкие напитки считаются отдельно от еды — стакан сока это ~25 г сахара,
 * самая незаметная утечка.
 */
export function NutritionTab() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [logged, setLogged] = useState<string | null>(null);

  const exceptions = useQuery({
    queryKey: ["exceptions-weekly"],
    queryFn: () => api.get<WeeklyExceptions>("/nutrition/exceptions/weekly/"),
  });
  const context = useQuery({
    queryKey: ["nutrition-series"],
    queryFn: () =>
      api.get<{ nutrition: { protein_by_day: { date: string; protein_g: number }[] } }>(
        "/context/",
        { sections: "nutrition" },
      ),
  });
  const freeMeals = useList<FreeMeal>(["free-meals"], "/nutrition/free-meals/");
  const today = useQuery({
    queryKey: ["nutrition-today"],
    queryFn: () =>
      api.get<{
        energy: {
          adaptive: {
            available: boolean;
            reason?: string;
            average_intake_kcal?: number;
            estimated_tdee_kcal?: number;
            trend_change_kg?: number;
            note?: string;
          };
          formula: { bmr_kcal: number; note: string } | null;
          target_kcal: number | null;
        } | null;
      }>("/nutrition/today/"),
  });

  if (exceptions.isLoading) return <Loading />;

  const logException = async (kind: string, sugar: number | null) => {
    await api.post("/nutrition/exceptions/", {
      at: new Date().toISOString(),
      kind,
      estimated_sugar_g: sugar,
    });
    setLogged(kind);
    window.setTimeout(() => setLogged(null), 2500);
    await exceptions.refetch();
  };

  const planFreeMeal = async () => {
    await api.post("/nutrition/free-meals/", {
      planned_for: new Date().toISOString().slice(0, 10),
    });
    await freeMeals.refetch();
  };

  const sugary = exceptions.data?.items.find((item) => item.kind === "sugary_drink");

  return (
    <>
      <Card title="Белок по дням" icon="protein" tone="green">
        {context.data?.nutrition.protein_by_day.length ? (
          <SimpleLineChart
            data={context.data.nutrition.protein_by_day.slice(-30)}
            dataKey="protein_g"
            name="белок, г"
          />
        ) : (
          <Empty>Данных пока нет.</Empty>
        )}
      </Card>

      <Card title="Исключения за неделю" icon="leaf" tone="teal">
        <div className="row row--wrap" style={{ marginBottom: "var(--space-3)" }}>
          {KINDS.map((kind) => (
            <Chip key={kind.code} small onClick={() => void logException(kind.code, kind.sugar)}>
              + {kind.label}
            </Chip>
          ))}
        </div>
        {logged && <p className="tiny">Отмечено. Это просто данные, а не приговор.</p>}

        {exceptions.data?.items.length ? (
          <ul className="list">
            {exceptions.data.items.map((item) => (
              <li key={item.kind} className="list__item">
                <span className="grow">{item.label}</span>
                <span className="mono">{item.count}</span>
                {item.estimated_sugar_g && (
                  <span className="tiny">≈{Number(item.estimated_sugar_g).toFixed(0)} г сахара</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>За эту неделю исключений не отмечено.</Empty>
        )}

        {sugary && sugary.count > 0 && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <Notice tone="info">
              Сладкие напитки: {sugary.count} за неделю
              {sugary.estimated_sugar_g &&
                ` — это примерно ${Number(sugary.estimated_sugar_g).toFixed(0)} г сахара`}
              . Они почти не замечаются, потому что не воспринимаются как еда.
            </Notice>
          </div>
        )}
      </Card>

      <Card
        title="Свободный приём"
        action={
          <button type="button" className="card__action" onClick={() => void planFreeMeal()}>
            Запланировать
          </button>
        }
      >
        <p className="tiny" style={{ marginBottom: "var(--space-2)" }}>
          Запреты приводят к срывам, плановое послабление — нет.
        </p>
        {freeMeals.data?.length ? (
          <ul className="list">
            {freeMeals.data.slice(0, 5).map((meal) => (
              <li key={meal.id} className="list__item">
                <span className="grow">{meal.planned_for}</span>
                <span className="tiny">{meal.happened_on ? "был" : "запланирован"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Пока не планировался.</Empty>
        )}
      </Card>

      {today.data?.energy && (
        <Card title="Расход калорий" icon="flame" tone="orange">
          {today.data.energy.adaptive.available ? (
            <>
              <p className="big-number">
                {today.data.energy.adaptive.estimated_tdee_kcal} ккал
              </p>
              <p className="muted">
                в среднем ел {today.data.energy.adaptive.average_intake_kcal} ккал,
                тренд-вес {today.data.energy.adaptive.trend_change_kg} кг
              </p>
              <p className="tiny" style={{ marginTop: "var(--space-2)" }}>
                {today.data.energy.adaptive.note}
              </p>
            </>
          ) : (
            <>
              <p className="muted">{today.data.energy.adaptive.reason}</p>
              {today.data.energy.formula && (
                <p className="tiny" style={{ marginTop: "var(--space-2)" }}>
                  Пока оценка по формуле: {today.data.energy.formula.bmr_kcal} ккал.{" "}
                  {today.data.energy.formula.note}
                </p>
              )}
            </>
          )}
        </Card>
      )}

      <MealsCard />

      <Card title="Продукты" icon="book" tone="blue">
        <Button onClick={() => setScannerOpen(true)}>Сканировать штрихкод</Button>
      </Card>

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} />
    </>
  );
}
