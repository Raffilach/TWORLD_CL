import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../shared/api/client";
import { Card, Chip, Empty } from "../../shared/ui/primitives";

interface Photo {
  id: number;
  date: string;
  pose: string;
  photo: string;
}

const POSES = [
  { code: "front", label: "спереди" },
  { code: "side", label: "сбоку" },
  { code: "back", label: "сзади" },
];

/**
 * Сравнение «до/после» слайдером.
 *
 * Один кадр поверх другого с подвижной границей: так разница видна
 * там, где два снимка рядом ничего не показывают.
 */
export function PhotoCompare() {
  const [pose, setPose] = useState("front");
  const [position, setPosition] = useState(50);

  const { data } = useQuery({
    queryKey: ["photo-compare", pose],
    queryFn: () => api.get<{ before: Photo | null; after: Photo | null }>("/body/photos/compare/", { pose }),
  });

  return (
    <Card title="До и после">
      <div className="row row--wrap" style={{ marginBottom: "var(--space-3)" }}>
        {POSES.map((item) => (
          <Chip key={item.code} small pressed={pose === item.code} onClick={() => setPose(item.code)}>
            {item.label}
          </Chip>
        ))}
      </div>

      {data?.before && data.after ? (
        <>
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              borderRadius: "var(--radius-md)",
              aspectRatio: "3 / 4",
              background: "var(--color-surface-sunken)",
            }}
          >
            <img
              src={data.after.photo}
              alt={`Снимок ${data.after.date}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${position}%`,
                overflow: "hidden",
                borderRight: "2px solid var(--color-accent)",
              }}
            >
              <img
                src={data.before.photo}
                alt={`Снимок ${data.before.date}`}
                style={{
                  width: `${(100 / position) * 100}%`,
                  height: "100%",
                  objectFit: "cover",
                  maxWidth: "none",
                }}
              />
            </div>
          </div>

          <label className="field" style={{ marginTop: "var(--space-3)" }}>
            <span className="visually-hidden">Положение границы сравнения</span>
            <input
              type="range"
              min={0}
              max={100}
              value={position}
              onChange={(event) => setPosition(Number(event.target.value))}
              style={{ padding: 0, border: "none", background: "transparent" }}
            />
          </label>

          <div className="row row--between">
            <span className="tiny">{data.before.date}</span>
            <span className="tiny">{data.after.date}</span>
          </div>
        </>
      ) : (
        <Empty>Нужно минимум два снимка в одном ракурсе.</Empty>
      )}
    </Card>
  );
}
