import { useId } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

import { Icon } from "./icons";
import type { IconName } from "./icons";

/** Тональные цвета плиток, полос и меток — см. --tone-* в tokens.css. */
export type Tone =
  | "blue"
  | "sky"
  | "green"
  | "teal"
  | "yellow"
  | "orange"
  | "purple"
  | "pink"
  | "red"
  | "neutral";

export function Card({
  title,
  action,
  icon,
  tone = "blue",
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  /** Иконка в цветной плитке слева от заголовка. */
  icon?: IconName;
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card__head">
          {icon && <IconTile icon={icon} tone={tone} size="sm" />}
          {title && <h2 className="card__title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Заголовок секции между карточками: «Ближайшие тренировки   показать все». */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {action}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "soft" | "danger";
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
    variant === "soft" && "btn--soft",
    variant === "danger" && "btn--danger",
    size === "lg" && "btn--lg",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button type="button" className={classes} {...props} />;
}

/** Круглая кнопка с иконкой: «+» на карточке, шестерёнка в шапке. */
export function IconButton({
  icon,
  label,
  variant = "soft",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
  variant?: "soft" | "primary" | "plain";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--${variant} icon-btn--${size} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon name={icon} size={size === "lg" ? 28 : size === "sm" ? 18 : 20} strokeWidth={2.2} />
    </button>
  );
}

/** Иконка в скруглённой цветной плитке. */
export function IconTile({
  icon,
  tone = "blue",
  size = "md",
}: {
  icon: IconName;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className={`icon-tile icon-tile--${size} tone-${tone}`} aria-hidden="true">
      <Icon name={icon} size={size === "lg" ? 26 : size === "sm" ? 16 : 20} />
    </span>
  );
}

export function Chip({
  pressed,
  children,
  small,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      className={`chip ${small ? "chip--sm" : ""} ${className}`}
      aria-pressed={pressed}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Сегментированный переключатель: «План · Упражнения · История».
 * Если вариантов больше, чем помещается, лента прокручивается вбок.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  scroll = false,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  scroll?: boolean;
}) {
  return (
    <div className={`segmented ${scroll ? "segmented--scroll" : ""}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="segmented__item"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({
  value,
  max,
  tone = "blue",
}: {
  value: number;
  max: number;
  tone?: Tone;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={`progress tone-${tone}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className="progress__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Кольцо прогресса с градиентом: «6/9 на сегодня». */
export function Ring({
  value,
  max,
  size = 112,
  stroke = 11,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  // useId даёт «:r0:» — двоеточия ломают ссылку url(#…) в SVG.
  const id = `ring${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const share = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ring-from)" />
            <stop offset="100%" stopColor="var(--ring-to)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={stroke}
        />
        {share > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${length * share} ${length}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring__arc"
        />
        )}
      </svg>
      <div className="ring__label">{children}</div>
    </div>
  );
}

/** Строка меню: иконка, текст, значение справа и шеврон. */
export function ListRow({
  icon,
  tone,
  title,
  subtitle,
  value,
  to,
  onClick,
  danger,
  chevron = true,
}: {
  icon?: IconName;
  tone?: Tone;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  const content = (
    <>
      {icon &&
        (tone ? (
          <IconTile icon={icon} tone={tone} size="sm" />
        ) : (
          <span className="list-row__icon" aria-hidden="true">
            <Icon name={icon} size={20} />
          </span>
        ))}
      <span className="list-row__text">
        <span className="list-row__title">{title}</span>
        {subtitle && <span className="list-row__subtitle">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="list-row__value">{value}</span>}
      {chevron && (
        <span className="list-row__chevron" aria-hidden="true">
          <Icon name="chevronRight" size={18} />
        </span>
      )}
    </>
  );
  const className = `list-row ${danger ? "list-row--danger" : ""}`;
  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  );
}

/** Переключатель iOS для настроек «вкл / выкл». */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__knob" />
    </button>
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

/**
 * Шкала точками: «●●●●○». Каждая точка — отдельная кнопка на всю
 * ширину своей доли, так что тап-зона остаётся 44×44.
 */
export function DotScale({
  value,
  max = 5,
  onChange,
  label,
  tone = "green",
}: {
  value: number | null;
  max?: number;
  onChange: (value: number) => void;
  label: string;
  tone?: Tone;
}) {
  return (
    <div className={`dot-scale tone-${tone}`} role="group" aria-label={label}>
      {Array.from({ length: max }, (_, index) => index + 1).map((option) => (
        <button
          key={option}
          type="button"
          className="dot-scale__btn"
          aria-pressed={value === option}
          aria-label={`${label}: ${option} из ${max}`}
          data-filled={value !== null && option <= value}
          onClick={() => onChange(option)}
        >
          <span className="dot-scale__dot" />
        </button>
      ))}
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
  return (
    <span className={`status-dot ${modifier}`} aria-hidden="true">
      {status === "done" && <Icon name="check" size={12} strokeWidth={3} />}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="loading__spinner" aria-hidden="true" />
      <span className="muted">Загружаем…</span>
    </div>
  );
}
