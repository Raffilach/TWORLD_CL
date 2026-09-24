/**
 * Тактильный отклик там, где он поддерживается.
 *
 * На iOS Web API вибрации нет — вызов просто ничего не делает,
 * приложение от этого не ломается.
 */
type Pattern = "tap" | "success" | "warning";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 10,
  success: [12, 40, 12],
  warning: [24, 60, 24],
};

export function haptic(pattern: Pattern = "tap") {
  try {
    navigator.vibrate?.(PATTERNS[pattern]);
  } catch {
    /* не поддерживается — не беда */
  }
}
