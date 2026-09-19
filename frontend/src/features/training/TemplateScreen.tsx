import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../../shared/api/client";
import type { TemplateBlock, WorkoutTemplate } from "../../shared/api/types";
import { Button, Card, Loading, Notice } from "../../shared/ui/primitives";

/**
 * Шаблон тренировки.
 *
 * Порядок упражнений имеет значение: то, что стоит в конце, пропускается
 * чаще. Поэтому перестановка — обычное действие, а не редкая настройка.
 */
export function TemplateScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: template, isLoading, refetch } = useQuery({
    queryKey: ["template", id],
    queryFn: () => api.get<WorkoutTemplate>(`/templates/${id}/`),
  });

  if (isLoading || !template) return <Loading />;

  const move = async (block: TemplateBlock, index: number, direction: -1 | 1) => {
    const items = [...block.exercises];
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    setBusy(true);
    try {
      await api.post(`/templates/${template.id}/reorder/`, {
        items: items.map((item, position) => ({
          template_exercise: item.id,
          block: block.id,
          order: position,
        })),
      });
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  const moveToTop = async (block: TemplateBlock, exerciseId: number) => {
    const rest = block.exercises.filter((item) => item.id !== exerciseId);
    const ordered = [block.exercises.find((item) => item.id === exerciseId)!, ...rest];
    await api.post(`/templates/${template.id}/reorder/`, {
      items: ordered.map((item, position) => ({
        template_exercise: item.id,
        block: block.id,
        order: position,
      })),
    });
    await refetch();
  };

  const start = async () => {
    const session = await api.post<{ id: number }>(`/templates/${template.id}/start/`, {});
    void queryClient.invalidateQueries({ queryKey: ["active-session"] });
    navigate(`/workout/${session.id}`);
  };

  return (
    <>
      <h2 style={{ marginBottom: "var(--space-2)" }}>{template.name}</h2>
      <p className="muted">
        Оценка: ~{template.estimated_minutes} мин
        {template.duration_limit_minutes && ` при лимите ${template.duration_limit_minutes} мин`}
      </p>
      {template.over_limit && (
        <div style={{ margin: "var(--space-3) 0" }}>
          <Notice>
            По числу подходов и отдыху тренировка выходит длиннее лимита.
            Можно убрать упражнение из блока «по остатку сил» или сократить отдых.
          </Notice>
        </div>
      )}

      {template.blocks.map((block) => (
        <Card key={block.id} title={block.priority_label}>
          {block.priority === "required" && (
            <p className="tiny" style={{ marginBottom: "var(--space-2)" }}>
              Если сделан только этот блок — день всё равно засчитан.
            </p>
          )}
          <ul className="list">
            {block.exercises.map((item, index) => (
              <li key={item.id} className="list__item">
                <span className="grow">
                  {item.exercise_name}
                  <br />
                  <span className="tiny">
                    {item.target_sets} ×{" "}
                    {item.target_seconds
                      ? `${item.target_seconds} с`
                      : `${item.target_reps_min ?? "?"}–${item.target_reps_max ?? "?"}`}
                    {item.target_weight_kg && ` · ${Number(item.target_weight_kg)} кг`}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn--square btn--ghost"
                  aria-label="Выше"
                  disabled={busy || index === 0}
                  onClick={() => void move(block, index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn--square btn--ghost"
                  aria-label="Ниже"
                  disabled={busy || index === block.exercises.length - 1}
                  onClick={() => void move(block, index, 1)}
                >
                  ↓
                </button>
                {index > 0 && (
                  <button
                    type="button"
                    className="chip chip--sm"
                    onClick={() => void moveToTop(block, item.id)}
                  >
                    в начало
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <div className="thumb-zone">
        <Button variant="primary" size="lg" onClick={() => void start()}>
          Начать тренировку
        </Button>
      </div>
    </>
  );
}
