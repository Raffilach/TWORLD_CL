import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { haptic } from "../hooks/useHaptics";

/**
 * Свайп влево по строке — удалить.
 *
 * Тап тоже работает: жест никогда не единственный способ что-то сделать.
 */
export function SwipeRow({
  children,
  onDelete,
  actionLabel = "Удалить",
}: {
  children: ReactNode;
  onDelete: () => void;
  actionLabel?: string;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const dragging = useRef(false);

  const THRESHOLD = 96;

  return (
    <div className="swipe-row">
      <span className="swipe-row__action" aria-hidden="true">
        {actionLabel}
      </span>
      <div
        className="swipe-row__content"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={(event) => {
          startX.current = event.touches[0].clientX;
          dragging.current = true;
        }}
        onTouchMove={(event) => {
          if (!dragging.current) return;
          const delta = event.touches[0].clientX - startX.current;
          setOffset(Math.min(0, Math.max(-140, delta)));
        }}
        onTouchEnd={() => {
          dragging.current = false;
          if (offset < -THRESHOLD) {
            haptic("warning");
            onDelete();
          }
          setOffset(0);
        }}
      >
        {children}
      </div>
    </div>
  );
}
