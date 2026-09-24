import { useRef, useState } from "react";

import { useAuth } from "../../app/auth";
import { api, ApiError } from "../../shared/api/client";
import type { Profile } from "../../shared/api/types";
import { Button, Card, Chip, Notice } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";
import { Avatar } from "./Avatar";

const SEX = [
  { code: "male", label: "мужской" },
  { code: "female", label: "женский" },
  { code: "other", label: "другой" },
  { code: "unspecified", label: "не указан" },
];

/** Личные данные, аватар и смена пароля. */
export function PersonalCard({ embedded = false }: { embedded?: boolean } = {}) {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(user?.profile ?? null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!user) return null;

  const patch = async (body: Partial<Profile>) => {
    const updated = await api.patch<Profile>("/accounts/profile/", body);
    setProfile(updated);
    await refreshUser();
  };

  const uploadAvatar = async (file: File) => {
    const form = new FormData();
    form.append("avatar", file);
    await api.patch("/accounts/profile/", form);
    await refreshUser();
    setMessage("Аватар обновлён.");
    window.setTimeout(() => setMessage(null), 3000);
  };

  return (
    <>
      <Card title={embedded ? undefined : "Профиль"} className={embedded ? "card--flat" : ""}>
        <div className="row" style={{ gap: "var(--space-4)" }}>
          <Avatar user={user} size={64} />
          <div className="grow">
            <p className="big-number">{user.display_name}</p>
            <p className="muted">{user.handle}</p>
          </div>
          <Button onClick={() => fileRef.current?.click()}>Фото</Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadAvatar(file);
            }}
          />
        </div>

        <label className="field" style={{ marginTop: "var(--space-4)" }}>
          <span className="field__label">Отображаемое имя</span>
          <input
            defaultValue={user.display_name}
            onBlur={async (event) => {
              await api.patch("/accounts/me/", { display_name: event.target.value });
              await refreshUser();
            }}
          />
          <span className="field__hint">Ник @{user.username} менять нельзя, имя — свободно.</span>
        </label>

        <div className="row" style={{ gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <label className="field grow">
            <span className="field__label">Рост, см</span>
            <input
              inputMode="decimal"
              defaultValue={profile?.height_cm ?? ""}
              onBlur={(event) => void patch({ height_cm: event.target.value || null })}
            />
          </label>
          <label className="field grow">
            <span className="field__label">Дата рождения</span>
            <input
              type="date"
              defaultValue={profile?.birth_date ?? ""}
              onBlur={(event) => void patch({ birth_date: event.target.value || null })}
            />
          </label>
        </div>

        <div className="row" style={{ gap: "var(--space-3)" }}>
          <label className="field grow">
            <span className="field__label">Стартовый вес, кг</span>
            <input
              inputMode="decimal"
              defaultValue={profile?.start_weight_kg ?? ""}
              onBlur={(event) => void patch({ start_weight_kg: event.target.value || null })}
            />
          </label>
          <label className="field grow">
            <span className="field__label">Часовой пояс</span>
            <input
              defaultValue={profile?.timezone ?? "Europe/Moscow"}
              onBlur={(event) => void patch({ timezone: event.target.value })}
            />
          </label>
        </div>

        <div style={{ marginTop: "var(--space-3)" }}>
          <span className="field__label">Пол</span>
          <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
            {SEX.map((option) => (
              <Chip
                key={option.code}
                small
                pressed={profile?.sex === option.code}
                onClick={() => void patch({ sex: option.code })}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "var(--space-3)" }}>
          <span className="field__label">Единицы измерения</span>
          <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
            {(["metric", "imperial"] as const).map((system) => (
              <Chip
                key={system}
                small
                pressed={profile?.unit_system === system}
                onClick={() => void patch({ unit_system: system })}
              >
                {system === "metric" ? "кг и см" : "фунты и дюймы"}
              </Chip>
            ))}
          </div>
          <span className="field__hint">
            В базе всё хранится в метрических — это только способ показа.
          </span>
        </div>

        <div style={{ marginTop: "var(--space-3)" }}>
          <span className="field__label">Язык</span>
          <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
            {(["ru", "en"] as const).map((language) => (
              <Chip
                key={language}
                small
                pressed={profile?.language === language}
                onClick={() => void patch({ language })}
              >
                {language === "ru" ? "русский" : "English"}
              </Chip>
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          <label className="field grow">
            <span className="field__label">Целевой вес, кг</span>
            <input
              inputMode="decimal"
              defaultValue={profile?.goal_weight_kg ?? ""}
              onBlur={(event) => void patch({ goal_weight_kg: event.target.value || null })}
            />
          </label>
          <label className="field grow">
            <span className="field__label">Целевой % жира</span>
            <input
              inputMode="decimal"
              defaultValue={profile?.goal_bodyfat_pct ?? ""}
              onBlur={(event) => void patch({ goal_bodyfat_pct: event.target.value || null })}
            />
          </label>
        </div>

        <label className="field">
          <span className="field__label">Дедлайн цели</span>
          <input
            type="date"
            defaultValue={profile?.goal_deadline ?? ""}
            onBlur={(event) => void patch({ goal_deadline: event.target.value || null })}
          />
        </label>

        {message && (
          <p className="tiny" style={{ marginTop: "var(--space-2)" }}>
            {message}
          </p>
        )}

        <div className="row" style={{ marginTop: "var(--space-4)" }}>
          <Button onClick={() => setPasswordOpen(true)}>Сменить пароль</Button>
        </div>
      </Card>

      <PasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    try {
      await api.post("/auth/password/change/", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setDone(true);
      setOldPassword("");
      setNewPassword("");
      window.setTimeout(() => {
        setDone(false);
        onClose();
      }, 1500);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.firstMessage : "Не получилось");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Смена пароля">
      <div className="stack">
        <label className="field">
          <span className="field__label">Текущий пароль</span>
          <input
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Новый пароль</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <span className="field__hint">Минимум 8 символов.</span>
        </label>
        {error && <Notice>{error}</Notice>}
        {done && <Notice tone="info">Пароль изменён.</Notice>}
        <Button variant="primary" size="lg" onClick={() => void submit()}>
          Сменить
        </Button>
      </div>
    </Sheet>
  );
}
