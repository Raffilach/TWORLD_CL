"""Стартовый опрос: из ответов — готовое к работе приложение.

Человек после регистрации отвечает на несколько вопросов (всё, кроме
цели, можно пропустить), а сервис превращает ответы в настройки:

- цели по белку и воде считаются от веса и цели;
- режим сна — из времени отбоя и подъёма;
- программа тренировок собирается из библиотеки упражнений под место,
  опыт, число дней и длительность, и ставится в расписание;
- привычки и добавки создаются сразу — экран «Сегодня» не пустой.

Повторный запуск (пройти опрос заново) не плодит дубли: привычки,
добавки и программы с тем же названием пропускаются.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.db import transaction
from django.utils import timezone

GOALS = {
    "lose": "Похудеть",
    "gain": "Набрать мышцы",
    "maintain": "Держать форму",
    "health": "Здоровье и энергия",
}

# Белок, г на кг веса. Консервативные значения из диапазона 1,4–2,2:
# при дефиците белка нужно больше, чтобы сохранить мышцы.
PROTEIN_PER_KG = {"lose": 2.0, "gain": 1.8, "maintain": 1.6, "health": 1.4}

QUIT_HABITS = {
    "sugar": ("Без сладкого", "sugar"),
    "smoking": ("Без сигарет", "smoking"),
    "alcohol": ("Без алкоголя", "alcohol"),
    "fastfood": ("Без фастфуда", ""),
    "soda": ("Без сладких напитков", "sugar"),
    "late_food": ("Не есть после 21:00", ""),
}

BUILD_HABITS = {
    "walk": ("Прогулка 30 минут", 7),
    "stretch": ("Растяжка", 5),
    "steps": ("10 000 шагов", 7),
    "reading": ("Чтение 20 минут", 5),
    "meditation": ("Медитация", 5),
    "no_phone": ("Без телефона перед сном", 7),
}

SUPPLEMENTS = {
    "creatine": "Креатин",
    "vitamin_d": "Витамин D",
    "omega3": "Омега-3",
    "magnesium": "Магний",
    "protein": "Протеин",
    "multivitamin": "Мультивитамины",
}

WEEKDAY_NAMES = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]

# --- Программы -------------------------------------------------------------
# (блок, упражнение). Блок «required» — минимум, после которого день
# засчитан; «optional» — по остатку сил. Названия — из seed_catalog.
GYM_PROGRAMS = {
    "full_a": ("Всё тело A", [
        ("required", "Жим гантелей лёжа"),
        ("required", "Тяга верхнего блока"),
        ("required", "Жим ногами"),
        ("main", "Тяга горизонтального блока"),
        ("main", "Махи гантелями в стороны"),
        ("optional", "Планка"),
    ]),
    "full_b": ("Всё тело B", [
        ("required", "Жим в тренажёре на грудь"),
        ("required", "Тяга в тренажёре сидя"),
        ("required", "Румынская тяга"),
        ("main", "Выпады с гантелями"),
        ("main", "Молотки с гантелями"),
        ("optional", "Скручивания на блоке"),
    ]),
    "upper": ("Верх тела", [
        ("required", "Жим штанги лёжа"),
        ("required", "Тяга верхнего блока"),
        ("required", "Жим гантелей сидя"),
        ("main", "Тяга гантели в наклоне"),
        ("main", "Разгибания на блоке"),
        ("main", "Подъём штанги на бицепс"),
        ("optional", "Махи в наклоне"),
    ]),
    "lower": ("Низ тела", [
        ("required", "Приседания со штангой"),
        ("required", "Румынская тяга"),
        ("required", "Жим ногами"),
        ("main", "Сгибания ног лёжа"),
        ("main", "Подъёмы на носки"),
        ("optional", "Подъём ног в висе"),
    ]),
}

HOME_PROGRAMS = {
    "full_a": ("Дома: всё тело A", [
        ("required", "Отжимания от пола"),
        ("required", "Выпады с гантелями"),
        ("required", "Тяга гантели в наклоне"),
        ("main", "Жим гантелей сидя"),
        ("main", "Молотки с гантелями"),
        ("optional", "Планка"),
    ]),
    "full_b": ("Дома: всё тело B", [
        ("required", "Жим гантелей лёжа"),
        ("required", "Румынская тяга"),
        ("required", "Подтягивания"),
        ("main", "Махи гантелями в стороны"),
        ("main", "Подъёмы на носки"),
        ("optional", "Боковая планка"),
    ]),
    "upper": ("Дома: верх тела", [
        ("required", "Отжимания от пола"),
        ("required", "Тяга гантели в наклоне"),
        ("required", "Жим гантелей сидя"),
        ("main", "Подтягивания"),
        ("main", "Молотки с гантелями"),
        ("optional", "Планка"),
    ]),
    "lower": ("Дома: низ тела", [
        ("required", "Выпады с гантелями"),
        ("required", "Румынская тяга"),
        ("required", "Подъёмы на носки"),
        ("main", "Гиперэкстензия"),
        ("optional", "Русский твист"),
    ]),
}

BLOCK_NAMES = {"required": "Обязательный", "main": "Основной", "optional": "По остатку сил"}


def _sets_reps(goal: str, experience: str) -> tuple[int, int, int]:
    """Подходы и диапазон повторений: цель задаёт повторы, опыт — объём."""
    reps = {"gain": (6, 10), "lose": (10, 15), "maintain": (8, 12), "health": (10, 15)}
    low, high = reps.get(goal, (8, 12))
    sets = {"beginner": 3, "intermediate": 3, "advanced": 4}.get(experience, 3)
    return sets, low, high


def _round_to(value: float, step: int) -> int:
    return int(round(value / step) * step)


def _parse_time(value) -> time | None:
    if isinstance(value, time):
        return value
    if not value:
        return None
    try:
        hours, minutes = str(value).split(":")[:2]
        return time(int(hours), int(minutes))
    except (TypeError, ValueError):
        return None


def _sleep_minutes(bed: time, wake: time) -> int:
    start = datetime.combine(date.today(), bed)
    end = datetime.combine(date.today(), wake)
    if end <= start:
        end += timedelta(days=1)
    return int((end - start).total_seconds() // 60)


def _plan_split(days: list[int]) -> list[tuple[int, str]]:
    """Какой шаблон в какой день: до трёх дней — всё тело A/B по очереди,
    от четырёх — верх/низ. Так мышца получает нагрузку дважды в неделю."""
    keys = ["full_a", "full_b"] if len(days) <= 3 else ["upper", "lower"]
    return [(day, keys[index % 2]) for index, day in enumerate(sorted(days))]


@transaction.atomic
def apply_onboarding(user, answers: dict, stored: dict | None = None) -> dict:
    """Применяет ответы опроса и возвращает сводку того, что настроено.

    `answers` — проверенные сериализатором значения (Decimal, date),
    `stored` — те же ответы в JSON-виде: они сохраняются в настройках,
    чтобы повторный опрос открывался с прошлыми ответами.
    """
    from apps.body.models import WeightEntry
    from apps.training.models import Exercise
    from apps.habits.models import Habit
    from apps.nutrition.models import Supplement
    from apps.training.models import (
        Gym,
        TemplateBlock,
        TemplateExercise,
        TemplateSchedule,
        WorkoutTemplate,
    )

    from .models import Profile, UserSettings

    profile, _ = Profile.objects.get_or_create(user=user)
    settings_obj, _ = UserSettings.objects.get_or_create(user=user)
    summary: dict = {"goal": GOALS.get(answers.get("goal"), ""), "created": {}}

    goal = answers.get("goal") or "maintain"

    # --- профиль ------------------------------------------------------------
    for field in ("sex", "birth_date", "height_cm", "goal_weight_kg"):
        if answers.get(field) not in (None, ""):
            setattr(profile, field, answers[field])
    weight = answers.get("weight_kg")
    if weight:
        profile.start_weight_kg = profile.start_weight_kg or weight
    profile.save()

    if weight:
        WeightEntry.objects.create(user=user, at=timezone.now(), weight_kg=weight)

    # --- питание -------------------------------------------------------------
    if weight:
        weight_f = float(weight)
        # На наборе и сушке считаем от целевого веса, если он ближе к реальности:
        # при 120 кг «2 г на кг» дают бессмысленные 240 г.
        goal_weight = answers.get("goal_weight_kg")
        basis = weight_f
        if goal_weight and goal == "lose":
            basis = max(float(goal_weight), weight_f * 0.85)
        protein = _round_to(basis * PROTEIN_PER_KG.get(goal, 1.6), 5)
        settings_obj.protein_target_g = max(60, min(250, protein))
        water = _round_to(weight_f * 33, 250)
        settings_obj.water_target_ml = max(1500, min(4000, water))
    summary["protein_target_g"] = settings_obj.protein_target_g
    summary["water_target_ml"] = settings_obj.water_target_ml

    # --- сон -------------------------------------------------------------------
    bed = _parse_time(answers.get("bedtime"))
    wake = _parse_time(answers.get("wake_time"))
    if bed:
        settings_obj.bedtime_goal = bed
    if wake:
        settings_obj.wake_goal = wake
    if bed and wake:
        settings_obj.sleep_target_minutes = max(360, min(600, _sleep_minutes(bed, wake)))
    if answers.get("commute_minutes") is not None:
        settings_obj.commute_home_minutes = int(answers["commute_minutes"])
    summary["bedtime"] = settings_obj.bedtime_goal.strftime("%H:%M") if isinstance(
        settings_obj.bedtime_goal, time
    ) else str(settings_obj.bedtime_goal)[:5]

    # --- тренировки --------------------------------------------------------------
    days = sorted({int(day) for day in answers.get("training_days") or [] if 0 <= int(day) <= 6})
    place = answers.get("place") or "gym"
    experience = answers.get("experience") or "beginner"
    minutes = int(answers.get("session_minutes") or 60)
    programs_created: list[dict] = []

    if days:
        gym_name = "Дома" if place == "home" else "Мой зал"
        gym, _ = Gym.objects.get_or_create(
            user=user, name=gym_name,
            defaults={"kind": Gym.Kind.HOME if place == "home" else Gym.Kind.WORK},
        )
        if not Gym.objects.filter(user=user, is_default=True).exists():
            gym.is_default = True
            gym.save(update_fields=["is_default"])
        if settings_obj.default_gym_id is None:
            settings_obj.default_gym = gym

        library = HOME_PROGRAMS if place == "home" else GYM_PROGRAMS
        sets, reps_low, reps_high = _sets_reps(goal, experience)
        templates: dict[str, WorkoutTemplate] = {}
        for weekday, key in _plan_split(days):
            if key not in templates:
                name, plan = library[key]
                existing = WorkoutTemplate.objects.filter(user=user, name=name).first()
                if existing:
                    templates[key] = existing
                else:
                    templates[key] = _build_template(
                        user, name, plan, sets, reps_low, reps_high, minutes,
                        Exercise, WorkoutTemplate, TemplateBlock, TemplateExercise,
                    )
                    programs_created.append({"id": templates[key].id, "name": name, "days": []})
            TemplateSchedule.objects.get_or_create(template=templates[key], weekday=weekday)
            for item in programs_created:
                if item["id"] == templates[key].id:
                    item["days"].append(WEEKDAY_NAMES[weekday])
    summary["created"]["programs"] = programs_created

    # --- привычки ----------------------------------------------------------------
    habits_created: list[str] = []
    order = Habit.objects.filter(user=user).count()
    today = timezone.localdate()
    for code in answers.get("quit_habits") or []:
        if code not in QUIT_HABITS:
            continue
        name, timeline = QUIT_HABITS[code]
        _, created = Habit.objects.get_or_create(
            user=user, name=name,
            defaults={"kind": "quit", "decision_date": today, "timeline_kind": timeline, "order": order},
        )
        if created:
            habits_created.append(name)
            order += 1
    for code in answers.get("build_habits") or []:
        if code not in BUILD_HABITS:
            continue
        name, per_week = BUILD_HABITS[code]
        _, created = Habit.objects.get_or_create(
            user=user, name=name,
            defaults={"kind": "build", "decision_date": today, "target_per_week": per_week, "order": order},
        )
        if created:
            habits_created.append(name)
            order += 1
    summary["created"]["habits"] = habits_created

    # --- добавки -------------------------------------------------------------------
    supplements_created: list[str] = []
    names = [SUPPLEMENTS[code] for code in answers.get("supplements") or [] if code in SUPPLEMENTS]
    names += [
        str(item).strip()[:80] for item in answers.get("custom_supplements") or [] if str(item).strip()
    ]
    order = Supplement.objects.filter(user=user).count()
    for name in names:
        _, created = Supplement.objects.get_or_create(
            user=user, name=name, defaults={"order": order}
        )
        if created:
            supplements_created.append(name)
            order += 1
    summary["created"]["supplements"] = supplements_created

    settings_obj.onboarding_answers = stored or {}
    settings_obj.onboarding_completed_at = timezone.now()
    settings_obj.save()
    return summary


def _build_template(user, name, plan, sets, reps_low, reps_high, minutes,
                    Exercise, WorkoutTemplate, TemplateBlock, TemplateExercise):
    template = WorkoutTemplate.objects.create(
        user=user, name=name, duration_limit_minutes=minutes,
        description="Собрана по стартовому опросу. Меняй как угодно.",
    )
    blocks = {}
    # Короткая тренировка — без блока «по остатку сил» и без последнего
    # основного упражнения: лучше закончить план, чем бросить его на середине.
    if minutes <= 45:
        plan = [item for item in plan if item[0] != "optional"]
        main = [item for item in plan if item[0] == "main"]
        if len(main) > 1:
            plan = [item for item in plan if item != main[-1]]
    for order, (priority, exercise_name) in enumerate(plan):
        exercise = Exercise.objects.filter(owner=None, name=exercise_name).first()
        if exercise is None:
            continue
        if priority not in blocks:
            blocks[priority] = TemplateBlock.objects.create(
                template=template, name=BLOCK_NAMES[priority], priority=priority,
                order=list(BLOCK_NAMES).index(priority),
            )
        timed = exercise.load_type == "time"
        TemplateExercise.objects.create(
            block=blocks[priority], exercise=exercise, order=order,
            target_sets=sets if priority != "optional" else max(2, sets - 1),
            target_reps_min=None if timed else reps_low,
            target_reps_max=None if timed else reps_high,
            target_seconds=45 if timed else None,
        )
    return template


def skip_onboarding(user) -> None:
    from .models import UserSettings

    settings_obj, _ = UserSettings.objects.get_or_create(user=user)
    settings_obj.onboarding_completed_at = timezone.now()
    settings_obj.save(update_fields=["onboarding_completed_at", "updated_at"])
