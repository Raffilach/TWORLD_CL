import { useEffect } from "react";
import type { ReactNode } from "react";

import { IconButton } from "./primitives";

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
        {title && (
          <div className="sheet__head">
            <h2 className="sheet__title">{title}</h2>
            <IconButton icon="close" label="Закрыть" variant="plain" size="sm" onClick={onClose} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
