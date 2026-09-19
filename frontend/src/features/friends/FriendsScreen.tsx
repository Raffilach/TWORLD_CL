import { useState } from "react";

import { useAuth } from "../../app/auth";
import { api } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import { Button, Card } from "../../shared/ui/primitives";

interface FeatureInterest {
  id: number;
  feature: string;
  message: string;
}

const PLANNED = [
  {
    title: "Делиться прогрессом",
    text: "Показывать друзьям только то, что выберешь сам: неделю, тренировку или серию привычки.",
  },
  {
    title: "Сравнивать серии привычек",
    text: "Видеть, у кого какая серия, и держаться вместе — без рейтингов и очков.",
  },
  {
    title: "Совместные челленджи",
    text: "Общая цель на несколько человек: километры, тренировки, чистые дни.",
  },
  {
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
      {/* Графический блок: структура есть, оформление — на токенах. */}
      <svg className="friends-art" viewBox="0 0 280 140" role="img" aria-label="Схема: люди и общий прогресс">
        <circle cx="70" cy="70" r="26" fill="none" stroke="var(--color-border-strong)" strokeWidth="2" />
        <circle cx="140" cy="46" r="20" fill="none" stroke="var(--color-border-strong)" strokeWidth="2" />
        <circle cx="210" cy="70" r="26" fill="none" stroke="var(--color-border-strong)" strokeWidth="2" />
        <path d="M96 70 H120" stroke="var(--color-border)" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M160 46 H184" stroke="var(--color-border)" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M70 96 Q140 130 210 96" fill="none" stroke="var(--color-border)" strokeWidth="2" />
        <rect x="56" y="58" width="28" height="6" rx="3" fill="var(--color-accent-subtle)" />
        <rect x="56" y="70" width="18" height="6" rx="3" fill="var(--color-accent-subtle)" />
        <rect x="196" y="58" width="28" height="6" rx="3" fill="var(--color-accent-subtle)" />
        <rect x="196" y="70" width="22" height="6" rx="3" fill="var(--color-accent-subtle)" />
      </svg>

      <h2 style={{ textAlign: "center", marginBottom: "var(--space-2)" }}>
        Друзья появятся здесь
      </h2>
      <p className="muted" style={{ textAlign: "center", marginBottom: "var(--space-5)" }}>
        Вот что здесь будет.
      </p>

      <ul className="feature-list" style={{ marginBottom: "var(--space-5)" }}>
        {PLANNED.map((item) => (
          <li key={item.title} className="feature-list__item">
            <span className="feature-list__marker" aria-hidden="true" />
            <span>
              <strong>{item.title}</strong>
              <br />
              <span className="muted">{item.text}</span>
            </span>
          </li>
        ))}
      </ul>

      <Button
        variant={subscribed ? "default" : "primary"}
        size="lg"
        disabled={subscribed}
        onClick={() => void subscribe()}
      >
        {subscribed ? "Сообщим, когда появится" : "Сообщить, когда появится"}
      </Button>

      <Card title="Твой ник">
        <div className="row row--between">
          <span className="big-number">{user?.handle}</span>
          <Button onClick={() => void copyHandle()}>{copied ? "Скопировано" : "Копировать"}</Button>
        </div>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          Когда друзья появятся, тебя найдут по нему.
        </p>
      </Card>

      <Card title="Что ещё было бы полезно">
        <div className="row" style={{ gap: "var(--space-2)" }}>
          <input
            className="grow"
            value={suggestion}
            placeholder="Например: общий челлендж по шагам"
            onChange={(event) => setSuggestion(event.target.value)}
          />
          <Button onClick={() => void sendSuggestion()} aria-label="Отправить предложение">
            →
          </Button>
        </div>
        {sent && <p className="tiny" style={{ marginTop: "var(--space-2)" }}>Записали, спасибо.</p>}
      </Card>
    </>
  );
}
