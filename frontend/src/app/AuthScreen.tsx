import { useEffect, useState } from "react";

import { api, ApiError } from "../shared/api/client";
import { Button, Notice } from "../shared/ui/primitives";
import { useAuth } from "./auth";

interface UsernameCheck {
  username: string;
  valid: boolean;
  available: boolean;
  reason?: string;
  suggestions: string[];
}

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [contact, setContact] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [check, setCheck] = useState<UsernameCheck | null>(null);

  // Проверка занятости ника в реальном времени с подсказками свободных.
  useEffect(() => {
    if (mode !== "register" || username.length < 3) {
      setCheck(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setCheck(await api.get<UsernameCheck>("/accounts/username-available/", { u: username }));
      } catch {
        setCheck(null);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [username, mode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "reset") {
        // Ответ одинаков независимо от того, есть такой email или нет.
        await api.post("/auth/password/reset/", { email: loginValue });
        setError("Если аккаунт с таким email есть, письмо со ссылкой уже отправлено.");
        return;
      }
      if (mode === "login") {
        await login(loginValue, password);
      } else {
        const isEmail = contact.includes("@");
        await register({
          username,
          password,
          display_name: displayName || undefined,
          email: isEmail ? contact : undefined,
          phone: isEmail ? undefined : contact,
        });
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.firstMessage : "Что-то пошло не так");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <h1 style={{ marginBottom: "var(--space-2)" }}>TWORLD</h1>
      <p className="muted" style={{ marginBottom: "var(--space-5)" }}>
        Тренировки, привычки и дневник — в одном месте.
      </p>

      <form className="stack" onSubmit={submit}>
        {mode === "reset" ? (
          <label className="field">
            <span className="field__label">Email для восстановления</span>
            <input
              type="email"
              value={loginValue}
              onChange={(event) => setLoginValue(event.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              inputMode="email"
              required
            />
            <span className="field__hint">Ссылка действует 30 минут.</span>
          </label>
        ) : mode === "login" ? (
          <label className="field">
            <span className="field__label">Ник, email или телефон</span>
            <input
              value={loginValue}
              onChange={(event) => setLoginValue(event.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="username"
              required
            />
          </label>
        ) : (
          <>
            <label className="field">
              <span className="field__label">Ник</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value.trim())}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="latin_5_32"
                required
              />
              {check && !check.valid && <span className="field__hint">{check.reason}</span>}
              {check?.valid && check.available && (
                <span className="field__hint">@{check.username} свободен</span>
              )}
              {check?.valid && !check.available && (
                <span className="field__hint">
                  Занят. Свободны:{" "}
                  {check.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="chip chip--sm"
                      style={{ marginRight: "var(--space-1)" }}
                      onClick={() => setUsername(suggestion)}
                    >
                      @{suggestion}
                    </button>
                  ))}
                </span>
              )}
            </label>

            <label className="field">
              <span className="field__label">Email или телефон</span>
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value.trim())}
                autoCapitalize="off"
                autoCorrect="off"
                inputMode="email"
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Как обращаться (необязательно)</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
              />
            </label>
          </>
        )}

        {mode !== "reset" && (
        <label className="field">
          <span className="field__label">Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </label>
        )}

        {error && <Notice>{error}</Notice>}

        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {mode === "login" ? "Войти" : mode === "register" ? "Создать аккаунт" : "Прислать ссылку"}
        </Button>

        <Button
          variant="ghost"
          onClick={() => {
            setMode(mode === "register" ? "login" : "register");
            setError(null);
          }}
        >
          {mode === "register" ? "У меня уже есть аккаунт" : "Нет аккаунта — зарегистрироваться"}
        </Button>

        {mode !== "reset" && (
          <Button
            variant="ghost"
            onClick={() => {
              setMode("reset");
              setError(null);
            }}
          >
            Забыл пароль
          </Button>
        )}
        {mode === "reset" && (
          <Button variant="ghost" onClick={() => { setMode("login"); setError(null); }}>
            Вернуться ко входу
          </Button>
        )}
      </form>
    </div>
  );
}
