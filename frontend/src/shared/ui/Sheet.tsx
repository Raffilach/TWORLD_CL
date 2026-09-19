import { useEffect } from "react";
import type { ReactNode } from "react";

/** Нижний лист: содержимое в зоне большого пальца, закрытие тапом по фону. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__handle" />
        {title && <h2 className="card__title" style={{ marginBottom: "var(--space-3)" }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
