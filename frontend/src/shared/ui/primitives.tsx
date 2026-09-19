import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card__head">
          {title && <h2 className="card__title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost";
  size?: "md" | "lg";
};

export function Button({
  variant = "default",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const classes = [
    "btn",
    variant === "primary" && "btn--primary",
    variant === "ghost" && "btn--ghost",
    size === "lg" && "btn--lg",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button type="button" className={classes} {...props} />;
}

export function Chip({
  pressed,
  children,
  small,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      className={`chip ${small ? "chip--sm" : ""}`}
      aria-pressed={pressed}
      {...props}
    >
      {children}
    </button>
  );
}

export function Progress({ value, max }: { value: number; max: number }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className="progress__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Шкала 1–5 или 1–10: все варианты видны сразу, выбор — один тап. */
export function Scale({
  value,
  max = 5,
  onChange,
  label,
}: {
  value: number | null;
  max?: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="scale" role="group" aria-label={label}>
        {Array.from({ length: max }, (_, index) => index + 1).map((option) => (
          <button
            key={option}
            type="button"
            className="scale__btn"
            aria-pressed={value === option}
            aria-label={`${label}: ${option} из ${max}`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Notice({
  children,
  tone = "warn",
}: {
  children: ReactNode;
  tone?: "warn" | "info";
}) {
  return <p className={`notice ${tone === "info" ? "notice--info" : ""}`}>{children}</p>;
}

export function StatusDot({ status }: { status: string }) {
  const modifier =
    status === "done"
      ? "status-dot--done"
      : status === "skipped"
        ? "status-dot--skipped"
        : status === "failed"
          ? "status-dot--failed"
          : "";
  return <span className={`status-dot ${modifier}`} aria-hidden="true" />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

export function Loading() {
  return <p className="muted">Загружаем…</p>;
}
