import { useState } from "react";

import { useAuth } from "../../app/auth";
import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import type { IconName } from "../../shared/ui/icons";
import { Card, IconButton, IconTile } from "../../shared/ui/primitives";
import type { Tone } from "../../shared/ui/primitives";

interface FeatureInterest {
  id: number;
  feature: string;
  message: string;
}

const PLANNED: { title: string; text: string; icon: IconName; tone: Tone }[] = [
  {
    icon: "chart",
    tone: "blue",
    title: "Делиться прогрессом",
    text: "Показывать друзьям только то, что выберешь сам: неделю, тренировку или серию привычки.",
  },
  {
    icon: "flame",
    tone: "orange",
    title: "Сравнивать серии привычек",
    text: "Видеть, у кого какая серия, и держаться вместе — без рейтингов и очков.",
  },
  {
    icon: "target",
    tone: "purple",
    title: "Совместные челленджи",
    text: "Общая цель на несколько человек: километры, тренировки, чистые дни.",
  },
  {
    icon: "heart",
    tone: "pink",
    title: "Реакции на тренировки",
    text: "Короткий отклик на чужую тренировку, когда она была тяжёлой.",
  },
];

/**
 * Вкладка «Друзья» — осознанная часть продукта, а не заброшенная страница.
 *
 * Функциональности пока нет, но экран уже полезен: показывает ник,
 * по которому найдут, и собирает сигнал о востребованности в таблицу
 * feature_interest. Никаких замочков и намёков на платную подписку.
 */
export function FriendsScreen() {
  const { user } = useAuth();
  const { data: interests, refetch } = useList<FeatureInterest>(
    ["feature-interest"],
    "/feature-interest/",
  );
  const [suggestion, setSuggestion] = useState("");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const subscribed = interests?.some(
    (item) => item.feature === "friends" && item.message === "",
  );

  const subscribe = async () => {
    await api.post("/feature-interest/", { feature: "friends" });
    await refetch();
  };

  const sendSuggestion = async () => {
    if (!suggestion.trim()) return;
    await api.post("/feature-interest/", { feature: "suggestion", message: suggestion });
    setSuggestion("");
    setSent(true);
    await refetch();
    window.setTimeout(() => setSent(false), 4000);
  };

  const copyHandle = async () => {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.handle);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <Card className="card--hero">
        <FriendsArt />
        <h2 className="center" style={{ fontSize: "var(--font-size-xl)", marginBottom: "var(--space-1)" }}>
          Друзья появятся здесь
        </h2>
        <p className="muted center" style={{ marginBottom: "var(--space-4)" }}>
          Скоро ты сможешь:
        </p>

        <ul className="feature-list">
          {PLANNED.map((item) => (
            <li key={item.title} className="feature-list__item">
              <IconTile icon={item.icon} tone={item.tone} size="sm" />
              <span className="grow">
                <span className="strong">{item.title}</span>
                <br />
                <span className="tiny">{item.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className={subscribed ? "" : "card--tinted tone-blue"}>
        <button
          type="button"
          className="tile-row"
          disabled={subscribed}
          onClick={() => void subscribe()}
        >
          <IconTile icon={subscribed ? "check" : "bell"} tone={subscribed ? "green" : "blue"} />
          <span className="tile-row__text">
            <span className="tile-row__title" style={{ color: subscribed ? undefined : "var(--color-accent)" }}>
              {subscribed ? "Сообщим, когда появится" : "Сообщить, когда появится"}
            </span>
            <span className="tile-row__meta">
              Мы напишем, как только функция станет доступна.
            </span>
          </span>
        </button>
      </Card>

      <Card>
        <p className="tiny">Твой username</p>
        <div className="row row--between">
          <span className="big-number" style={{ fontSize: "var(--font-size-xl)" }}>{user?.handle}</span>
          <IconButton
            icon={copied ? "check" : "copy"}
            label={copied ? "Скопировано" : "Копировать ник"}
            onClick={() => void copyHandle()}
          />
        </div>
        <p className="tiny" style={{ marginTop: "var(--space-1)" }}>
          Когда друзья появятся, тебя найдут по нему.
        </p>
      </Card>

      <Card title="Что ещё добавить?">
        <div className="input-action">
          <input
            value={suggestion}
            placeholder="Например: общий челлендж по шагам"
            aria-label="Предложение"
            onChange={(event) => setSuggestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void sendSuggestion();
            }}
          />
          <IconButton
            icon="arrowRight"
            label="Отправить предложение"
            variant="primary"
            onClick={() => void sendSuggestion()}
          />
        </div>
        {sent && <p className="tiny" style={{ marginTop: "var(--space-2)" }}>Записали, спасибо.</p>}
      </Card>
    </>
  );
}

/** Иллюстрация: три «человечка»-пузыря и плюс — на тональных цветах. */
function FriendsArt() {
  return (
    <svg className="friends-art" viewBox="0 0 260 150" role="img" aria-label="Люди и общий прогресс">
      <circle cx="130" cy="78" r="64" fill="var(--tone-blue-bg)" />
      <circle cx="58" cy="54" r="5" fill="var(--tone-teal)" opacity="0.5" />
      <circle cx="214" cy="40" r="4" fill="var(--tone-purple)" opacity="0.5" />
      <circle cx="206" cy="122" r="3" fill="var(--tone-blue)" opacity="0.5" />
      {/* левый */}
      <circle cx="78" cy="78" r="15" fill="var(--tone-teal)" opacity="0.85" />
      <rect x="52" y="96" width="52" height="34" rx="17" fill="var(--tone-teal)" opacity="0.55" />
      {/* правый */}
      <circle cx="184" cy="72" r="15" fill="var(--tone-purple)" opacity="0.8" />
      <rect x="158" y="90" width="52" height="40" rx="18" fill="var(--tone-purple)" opacity="0.5" />
      {/* центр */}
      <circle cx="130" cy="56" r="21" fill="var(--tone-blue)" />
      <rect x="96" y="82" width="68" height="50" rx="24" fill="var(--tone-blue)" opacity="0.9" />
      {/* плюс */}
      <circle cx="162" cy="116" r="15" fill="var(--color-surface)" stroke="var(--tone-blue)" strokeWidth="2" />
      <path d="M162 109v14M155 116h14" stroke="var(--tone-blue)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
