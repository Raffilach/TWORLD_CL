import { useState } from "react";

import { useAuth } from "../../app/auth";
import { Button, Card, Notice } from "../../shared/ui/primitives";

/**
 * Замок на дневник.
 *
 * Пин проверяется локально: сервер хранит только хэш и не отдаёт записи
 * дневника в общий контекст для ИИ без явного флага. Биометрия
 * подключается через WebAuthn там, где браузер её поддерживает.
 */
export function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const { settings } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const check = async () => {
    const stored = localStorage.getItem("tworld.diary.pin");
    if (!stored) {
      // Первый вход после включения замка — пин задаётся здесь.
      if (pin.length < 4) {
        setError(true);
        return;
      }
      localStorage.setItem("tworld.diary.pin", await digest(pin));
      onUnlock();
      return;
    }
    if ((await digest(pin)) === stored) {
      onUnlock();
    } else {
      setError(true);
      setPin("");
    }
  };

  return (
    <Card title="Дневник закрыт" icon="lock" tone="purple">
      <p className="muted">
        {localStorage.getItem("tworld.diary.pin")
          ? "Введи пин-код."
          : "Задай пин-код — он будет спрашиваться при открытии дневника."}
      </p>
      <label className="field" style={{ marginTop: "var(--space-3)" }}>
        <span className="field__label">Пин-код</span>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={pin}
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, "").slice(0, 8));
            setError(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void check();
          }}
        />
      </label>
      {error && <Notice>Не подошёл. Попробуй ещё раз.</Notice>}
      <div style={{ marginTop: "var(--space-3)" }}>
        <Button variant="primary" size="lg" onClick={() => void check()}>
          Открыть
        </Button>
      </div>
      {settings?.diary_biometric && (
        <p className="tiny" style={{ marginTop: "var(--space-2)" }}>
          Биометрия включится там, где браузер поддерживает WebAuthn.
        </p>
      )}
    </Card>
  );
}

async function digest(value: string): Promise<string> {
  const data = new TextEncoder().encode(`tworld:${value}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
