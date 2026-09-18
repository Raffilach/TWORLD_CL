import re

from django.core.exceptions import ValidationError

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{5,32}$")

RESERVED_USERNAMES = {
    "admin", "administrator", "root", "api", "app", "me", "self", "support",
    "help", "about", "login", "logout", "signup", "register", "settings",
    "profile", "user", "users", "system", "tworld", "static", "media",
    "friends", "today", "workout", "workouts", "progress", "null", "undefined",
}


def validate_username(value: str) -> None:
    """Ник как в Telegram: латиница, цифры, подчёркивание, 5–32 символа."""
    if not USERNAME_RE.match(value or ""):
        raise ValidationError(
            "Ник может содержать только латинские буквы, цифры и подчёркивание, "
            "длина от 5 до 32 символов."
        )
    if value.lower() in RESERVED_USERNAMES:
        raise ValidationError("Этот ник зарезервирован.")


def suggest_usernames(base: str, taken_checker, limit: int = 3) -> list[str]:
    """Подсказки свободных вариантов при занятом нике."""
    root = re.sub(r"[^a-z0-9_]", "", (base or "").lower())[:26] or "user"
    root = root.ljust(5, "0")
    candidates = [f"{root}_{suffix}" for suffix in ("1", "2", "gym", "pro", "x")]
    candidates += [f"{root}{n}" for n in range(1, 40)]
    free = []
    for candidate in candidates:
        if len(candidate) > 32:
            continue
        if USERNAME_RE.match(candidate) and not taken_checker(candidate):
            free.append(candidate)
        if len(free) >= limit:
            break
    return free
