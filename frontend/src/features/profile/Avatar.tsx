import type { User } from "../../shared/api/types";

/**
 * Аватар: загруженный файл или заглушка из инициалов.
 *
 * Заглушка не хранится файлом — она вычисляется из имени, поэтому
 * есть у каждого пользователя сразу после регистрации.
 */
export function Avatar({ user, size = 40 }: { user: User; size?: number }) {
  if (user.profile?.avatar) {
    return (
      <img
        src={user.profile.avatar}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: "var(--radius-pill)", objectFit: "cover" }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-pill)",
        background: "var(--color-accent-subtle)",
        color: "var(--color-text)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: "var(--font-weight-bold)",
      }}
    >
      {user.initials}
    </span>
  );
}
