import { useState } from "react";

import { useAuth } from "../../app/auth";
import { api, ApiError } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import {
  applySurface,
  applyTheme,
  getSurface,
} from "../../shared/ui/appearance";
import { NotificationSettings } from "./NotificationSettings";
import { Avatar } from "./Avatar";
import { PersonalCard } from "./PersonalCard";
import { useHeaderAction } from "../../app/header";
import { Icon } from "../../shared/ui/icons";
import { Button, Card, Chip, Empty, IconButton, ListRow, Notice, Toggle } from "../../shared/ui/primitives";
import { Sheet } from "../../shared/ui/Sheet";

interface ApiToken {
  id: number;
  name: string;
  scope: "read" | "write";
  prefix: string;
  created_at: string;
  revoked_at: string | null;
  token?: string;
}

interface ShareLink {
  id: number;
  slug: string;
  kind: string;
  url: string;
  is_active: boolean;
  expires_at: string | null;
}

type Section =
  | "personal"
  | "goals"
  | "sleep"
  | "training"
  | "notifications"
  | "appearance"
  | "privacy"
  | "ai"
  | "links"
  | "data";

/**
 * Профиль — меню, а не простыня настроек: каждая группа открывается
 * в нижнем листе. Главный экран профиля помещается в один экран телефона.
 */
export function ProfileScreen() {
  const { user, settings, patchSettings, logout, refreshUser } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [planText, setPlanText] = useState("");
  const [planResult, setPlanResult] = useState<string | null>(null);
  const [surfaceMode, setSurfaceMode] = useState(getSurface);
  const [section, setSection] = useState<Section | null>(null);

  const tokens = useList<ApiToken>(["tokens"], "/tokens/");
  const links = useList<ShareLink>(["share-links"], "/share-links/");

  useHeaderAction(
    <IconButton icon="settings" label="Настройки" variant="plain" onClick={() => setSection("appearance")} />,
  );

  if (!user || !settings) return null;

  const apiBase = import.meta.env.VITE_API_URL ?? "/api";

  const createToken = async (scope: "read" | "write") => {
    const created = await api.post<ApiToken>("/tokens/", {
      name: scope === "read" ? "Чтение" : "Чтение и запись",
      scope,
    });
    setNewToken(created.token ?? null);
    await tokens.refetch();
  };

  const importPlan = async () => {
    setPlanResult(null);
    try {
      const result = await api.post<{ template: { name: string }; created_exercises: string[] }>(
        "/plans/import/",
        { text: planText },
      );
      setPlanResult(
        `Создан шаблон «${result.template.name}»` +
          (result.created_exercises.length
            ? `. Новые упражнения: ${result.created_exercises.join(", ")}`
            : ""),
      );
      setPlanText("");
    } catch (caught) {
      setPlanResult(caught instanceof ApiError ? caught.firstMessage : "Не удалось разобрать план");
    }
  };

  const remove = async () => {
    setError(null);
    try {
      await api.post("/accounts/delete/", { confirm_username: confirmName });
      logout();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.firstMessage : "Не получилось");
    }
  };

  const goal = user.profile?.goal_weight_kg
    ? `Цель: ${Number(user.profile.goal_weight_kg).toFixed(1)} кг`
    : "Цель можно задать в профиле";

  const close = () => setSection(null);

  return (
    <>
      <Card>
        <button type="button" className="profile-card" style={{ width: "100%", textAlign: "left" }} onClick={() => setSection("personal")}>
          <Avatar user={user} size={60} />
          <span className="grow">
            <span className="profile-card__name">{user.display_name}</span>
            <br />
            <span className="muted">{user.handle}</span>
          </span>
          <span className="list-row__chevron" aria-hidden="true">
            <Icon name="chevronRight" size={18} />
          </span>
        </button>
        <p className="tiny" style={{ marginTop: "var(--space-3)" }}>{goal}</p>
      </Card>

      <div className="card menu">
        <ListRow icon="user" title="Мой профиль" onClick={() => setSection("personal")} />
        <ListRow icon="target" title="Цели и питание" value={`${settings.protein_target_g} г белка`} onClick={() => setSection("goals")} />
        <ListRow icon="moon" title="Сон и вечер" value={settings.bedtime_goal?.slice(0, 5)} onClick={() => setSection("sleep")} />
        <ListRow icon="dumbbell" title="Тренировки" onClick={() => setSection("training")} />
        <ListRow icon="bell" title="Уведомления" onClick={() => setSection("notifications")} />
        <ListRow icon="palette" title="Внешний вид" value={THEME_LABELS[settings.theme] ?? ""} onClick={() => setSection("appearance")} />
      </div>

      <div className="card menu">
        <ListRow icon="download" title="Экспорт данных" onClick={() => setSection("data")} />
        <ListRow icon="code" title="API для ИИ" onClick={() => setSection("ai")} />
        <ListRow icon="link" title="Публичные ссылки" onClick={() => setSection("links")} />
        <ListRow icon="shield" title="Безопасность" onClick={() => setSection("privacy")} />
      </div>

      <div className="card menu">
        <ListRow icon="logout" title="Выйти" chevron={false} onClick={logout} />
        <ListRow icon="trash" title="Удалить аккаунт" danger onClick={() => setDeleteOpen(true)} />
      </div>

      <Sheet open={section === "personal"} onClose={close} title="Мой профиль">
        <PersonalCard embedded />
      </Sheet>

      <Sheet open={section === "goals"} onClose={close} title="Цели и питание">
      <label className="field">
        <span className="field__label">Цель по белку, г/день</span>
        <input
          type="number"
          inputMode="numeric"
          defaultValue={settings.protein_target_g}
          onBlur={(event) => void patchSettings({ protein_target_g: Number(event.target.value) })}
        />
      </label>
      <label className="field" style={{ marginTop: "var(--space-3)" }}>
        <span className="field__label">Цель по воде, мл</span>
        <input
          type="number"
          inputMode="numeric"
          defaultValue={settings.water_target_ml}
          onBlur={(event) => void patchSettings({ water_target_ml: Number(event.target.value) })}
        />
      </label>
      <div className="row row--between" style={{ marginTop: "var(--space-4)" }}>
        <span>
          Считать калории
          <br />
          <span className="tiny">
            По умолчанию выключено: обязательный подсчёт — главная причина бросить трекер.
          </span>
        </span>
        <Toggle
          checked={settings.track_calories}
          label="Считать калории"
          onChange={() => void patchSettings({ track_calories: !settings.track_calories })}
        />
      </div>
      </Sheet>

      <Sheet open={section === "sleep"} onClose={close} title="Сон и вечер">
      <div className="row" style={{ gap: "var(--space-3)" }}>
        <label className="field grow">
          <span className="field__label">Цель отбоя</span>
          <input
            type="time"
            defaultValue={settings.bedtime_goal?.slice(0, 5)}
            onBlur={(event) => void patchSettings({ bedtime_goal: event.target.value })}
          />
        </label>
        <label className="field grow">
          <span className="field__label">Дорога домой, мин</span>
          <input
            type="number"
            inputMode="numeric"
            defaultValue={settings.commute_home_minutes}
            onBlur={(event) =>
              void patchSettings({ commute_home_minutes: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <p className="muted" style={{ marginTop: "var(--space-2)" }}>
        Выйти из зала не позже {settings.leave_gym_by}, чтобы лечь вовремя.
      </p>
      </Sheet>

      <Sheet open={section === "training"} onClose={close} title="Тренировки">
      <div className="row row--between">
        <span>Спрашивать RIR</span>
        <Toggle
          checked={settings.ask_rir}
          label="Спрашивать RIR"
          onChange={() => void patchSettings({ ask_rir: !settings.ask_rir })}
        />
      </div>
      <label className="field" style={{ marginTop: "var(--space-3)" }}>
        <span className="field__label">Отдых по умолчанию, сек</span>
        <input
          type="number"
          inputMode="numeric"
          defaultValue={settings.rest_default_seconds}
          onBlur={(event) =>
            void patchSettings({ rest_default_seconds: Number(event.target.value) })
          }
        />
      </label>
      </Sheet>

      <Sheet open={section === "notifications"} onClose={close} title="Уведомления">
        <NotificationSettings embedded />
      </Sheet>

      <Sheet open={section === "appearance"} onClose={close} title="Внешний вид">
      <span className="field__label">Тема</span>
      <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
        {(["auto", "light", "dark"] as const).map((theme) => (
          <Chip
            key={theme}
            small
            pressed={settings.theme === theme}
            onClick={() => {
              void patchSettings({ theme });
              applyTheme(theme);
            }}
          >
            {theme === "auto" ? "как в системе" : theme === "light" ? "светлая" : "тёмная"}
          </Chip>
        ))}
      </div>

      <span className="field__label" style={{ display: "block", marginTop: "var(--space-4)" }}>
        Поверхности
      </span>
      <div className="row row--wrap" style={{ marginTop: "var(--space-2)" }}>
        {(["glass", "solid"] as const).map((surface) => (
          <Chip
            key={surface}
            small
            pressed={surfaceMode === surface}
            onClick={() => {
              setSurfaceMode(surface);
              applySurface(surface);
            }}
          >
            {surface === "glass" ? "стекло" : "плотные"}
          </Chip>
        ))}
      </div>
      <span className="field__hint" style={{ marginTop: "var(--space-2)", display: "block" }}>
        Размытие стоит ресурсов. На старом телефоне плотные поверхности
        заметно экономят батарею, и ничего в интерфейсе не ломается.
      </span>
      </Sheet>

      <Sheet open={section === "privacy"} onClose={close} title="Безопасность">
      <div className="row row--between">
        <span>
          Пин-код на дневник
          <br />
          <span className="tiny">
            Записи дневника не попадают в выгрузку для ИИ без явного согласия.
          </span>
        </span>
        <Toggle
          checked={settings.diary_lock_enabled}
          label="Пин-код на дневник"
          onChange={() => void patchSettings({ diary_lock_enabled: !settings.diary_lock_enabled })}
        />
      </div>
        <div style={{ marginTop: "var(--space-4)" }}>
          <Button onClick={() => void refreshUser()}>Обновить профиль</Button>
        </div>
      </Sheet>

      <Sheet open={section === "ai"} onClose={close} title="API для ИИ">
      <p className="muted">
        Токен показывается один раз. Токен «только чтение» физически не может
        изменить данные.
      </p>
      <div className="row row--wrap" style={{ marginTop: "var(--space-3)" }}>
        <Button onClick={() => void createToken("read")}>Токен на чтение</Button>
        <Button onClick={() => void createToken("write")}>Токен на запись</Button>
      </div>
      {newToken && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Notice>
            Сохрани сейчас — больше он не покажется:
            <br />
            <code className="mono">{newToken}</code>
          </Notice>
        </div>
      )}
      <ul className="list" style={{ marginTop: "var(--space-3)" }}>
        {tokens.data?.map((token) => (
          <li key={token.id} className="list__item">
            <span className="grow">
              {token.name}
              <br />
              <span className="tiny">
                {token.prefix}… · {token.scope === "read" ? "чтение" : "запись"}
                {token.revoked_at && " · отозван"}
              </span>
            </span>
            {!token.revoked_at && (
              <Button
                onClick={async () => {
                  await api.post(`/tokens/${token.id}/revoke/`, {});
                  await tokens.refetch();
                }}
              >
                Отозвать
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="tiny" style={{ marginTop: "var(--space-2)" }}>
        Контекст для модели: <code className="mono">{apiBase}/context/?format=markdown</code>.
        MCP-сервер — в каталоге backend/mcp_server.
      </p>
        <h3 className="sheet__title" style={{ margin: "var(--space-5) 0 var(--space-2)" }}>Импорт плана от ИИ</h3>
      <textarea
        rows={5}
        value={planText}
        placeholder={"# Верх тела\n\n## Обязательный\n| Упражнение | Подходы | Повторы | Вес |\n|---|---|---|---|\n| Жим штанги лёжа | 4 | 6-8 | 62.5 |"}
        onChange={(event) => setPlanText(event.target.value)}
      />
      <div style={{ marginTop: "var(--space-2)" }}>
        <Button variant="primary" onClick={() => void importPlan()}>
          Импортировать
        </Button>
      </div>
      {planResult && <p className="muted" style={{ marginTop: "var(--space-2)" }}>{planResult}</p>}
      </Sheet>

      <Sheet open={section === "links"} onClose={close} title="Публичные ссылки">
      {links.data?.length ? (
        <ul className="list">
          {links.data.map((link) => (
            <li key={link.id} className="list__item">
              <span className="grow tiny">{link.url}</span>
              {link.is_active && (
                <Button
                  onClick={async () => {
                    await api.post(`/share-links/${link.id}/revoke/`, {});
                    await links.refetch();
                  }}
                >
                  Отозвать
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Публичных ссылок нет.</Empty>
      )}
      </Sheet>

      <Sheet open={section === "data"} onClose={close} title="Экспорт данных">
        <p className="muted" style={{ marginBottom: "var(--space-3)" }}>
          Все записи целиком — тренировки, замеры, привычки, дневник.
        </p>
      <div className="row row--wrap">
        <a className="btn" href={`${apiBase}/accounts/export/?format=json`}>
          Экспорт JSON
        </a>
        <a className="btn" href={`${apiBase}/accounts/export/?format=csv`}>
          Экспорт CSV
        </a>
      </div>
      </Sheet>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Удалить аккаунт">
        <p className="muted">
          Удалятся все данные: тренировки, замеры, привычки, дневник и файлы.
          Отменить это нельзя. Перед удалением имеет смысл выгрузить экспорт.
        </p>
        <label className="field" style={{ marginTop: "var(--space-3)" }}>
          <span className="field__label">Введи свой ник для подтверждения</span>
          <input
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            autoCapitalize="off"
          />
        </label>
        {error && <Notice>{error}</Notice>}
        <div style={{ marginTop: "var(--space-3)" }}>
          <Button variant="danger" size="lg" onClick={() => void remove()}>
            Удалить всё
          </Button>
        </div>
      </Sheet>
    </>
  );
}

const THEME_LABELS: Record<string, string> = {
  auto: "как в системе",
  light: "светлая",
  dark: "тёмная",
};
