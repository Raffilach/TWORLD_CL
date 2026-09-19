import { useState } from "react";

import { useAuth } from "../../app/auth";
import { api, ApiError } from "../../shared/api/client";
import { useList } from "../../shared/api/hooks";
import { NotificationSettings } from "./NotificationSettings";
import { PersonalCard } from "./PersonalCard";
import { Button, Card, Chip, Empty, Notice } from "../../shared/ui/primitives";
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

export function ProfileScreen() {
  const { user, settings, patchSettings, logout, refreshUser } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [planText, setPlanText] = useState("");
  const [planResult, setPlanResult] = useState<string | null>(null);

  const tokens = useList<ApiToken>(["tokens"], "/tokens/");
  const links = useList<ShareLink>(["share-links"], "/share-links/");

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

  return (
    <>
      <PersonalCard />

      <Card title="Цели и питание">
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
          <Chip
            pressed={settings.track_calories}
            onClick={() => void patchSettings({ track_calories: !settings.track_calories })}
          >
            {settings.track_calories ? "вкл" : "выкл"}
          </Chip>
        </div>
      </Card>

      <Card title="Сон и вечер">
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
      </Card>

      <Card title="Тренировки">
        <div className="row row--between">
          <span>Спрашивать RIR</span>
          <Chip pressed={settings.ask_rir} onClick={() => void patchSettings({ ask_rir: !settings.ask_rir })}>
            {settings.ask_rir ? "да" : "нет"}
          </Chip>
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
      </Card>

      <NotificationSettings />

      <Card title="Приватность">
        <div className="row row--between">
          <span>
            Пин-код на дневник
            <br />
            <span className="tiny">
              Записи дневника не попадают в выгрузку для ИИ без явного согласия.
            </span>
          </span>
          <Chip
            pressed={settings.diary_lock_enabled}
            onClick={() => void patchSettings({ diary_lock_enabled: !settings.diary_lock_enabled })}
          >
            {settings.diary_lock_enabled ? "вкл" : "выкл"}
          </Chip>
        </div>
      </Card>

      <Card title="Тема">
        <div className="row row--wrap">
          {(["auto", "light", "dark"] as const).map((theme) => (
            <Chip
              key={theme}
              small
              pressed={settings.theme === theme}
              onClick={() => {
                void patchSettings({ theme });
                document.documentElement.dataset.theme = theme === "auto" ? "" : theme;
              }}
            >
              {theme === "auto" ? "как в системе" : theme === "light" ? "светлая" : "тёмная"}
            </Chip>
          ))}
        </div>
      </Card>

      <Card title="Интеграции с ИИ">
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
      </Card>

      <Card title="Импорт плана от ИИ">
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
      </Card>

      <Card title="Публичные ссылки">
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
      </Card>

      <Card title="Данные">
        <div className="row row--wrap">
          <a className="btn" href={`${apiBase}/accounts/export/?format=json`}>
            Экспорт JSON
          </a>
          <a className="btn" href={`${apiBase}/accounts/export/?format=csv`}>
            Экспорт CSV
          </a>
        </div>
      </Card>

      <Card title="Аккаунт">
        <div className="row row--wrap">
          <Button onClick={() => void refreshUser()}>Обновить профиль</Button>
          <Button onClick={logout}>Выйти</Button>
          <Button onClick={() => setDeleteOpen(true)}>Удалить аккаунт</Button>
        </div>
      </Card>

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
          <Button size="lg" onClick={() => void remove()}>
            Удалить всё
          </Button>
        </div>
      </Sheet>
    </>
  );
}
