/**
 * Внешний вид: тема и режим поверхностей.
 *
 * Оба параметра применяются атрибутами на <html> и читаются токенами.
 * Хранятся локально: это настройка конкретного устройства — на старом
 * телефоне стекло разумно выключить, не трогая остальные.
 */
export type Theme = "auto" | "light" | "dark";
export type Surface = "glass" | "solid";

const THEME_KEY = "tworld.theme";
const SURFACE_KEY = "tworld.surface";

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* приватный режим — настройка не переживёт перезапуск, и ладно */
  }
}

export function getTheme(): Theme {
  return read(THEME_KEY, "auto") as Theme;
}

export function getSurface(): Surface {
  return read(SURFACE_KEY, "glass") as Surface;
}

export function applyTheme(theme: Theme) {
  write(THEME_KEY, theme);
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;
}

export function applySurface(surface: Surface) {
  write(SURFACE_KEY, surface);
  const root = document.documentElement;
  if (surface === "glass") root.removeAttribute("data-surface");
  else root.dataset.surface = surface;
}

/** Вызывается до первого рендера, чтобы не было вспышки чужой темы. */
export function initAppearance() {
  applyTheme(getTheme());
  applySurface(getSurface());
}
