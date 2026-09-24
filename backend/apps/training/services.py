"""Доменная логика тренировок: рекорды, прогрессия, предупреждения."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Count, Q, Sum
from django.utils import timezone

from .models import (
    BlockPriority,
    Exercise,
    GymExerciseProfile,
    LoadType,
    PersonalRecord,
    ProgressionSuggestion,
    SessionExercise,
    SetLog,
    WorkoutSession,
    WorkoutTemplate,
)

CONF = settings.TWORLD


# --------------------------------------------------------------------------
# создание тренировки
# --------------------------------------------------------------------------
def build_session_from_template(
    user, template: WorkoutTemplate, gym=None, on: date | None = None
) -> WorkoutSession:
    """Старт одной кнопкой: план уже развёрнут в упражнения сессии."""
    on = on or timezone.localdate()
    session = WorkoutSession.objects.create(
        user=user,
        template=template,
        gym=gym or getattr(getattr(user, "settings", None), "default_gym", None),
        date=on,
        status=WorkoutSession.Status.IN_PROGRESS,
        started_at=timezone.now(),
    )
    excluded = set(
        user.plannedexclusions.filter(
            Q(date_to__isnull=True) | Q(date_to__gte=on), date_from__lte=on
        ).values_list("exercise_id", flat=True)
    )
    order = 0
    for block in template.blocks.all().order_by("order"):
        for item in block.exercises.all().order_by("order"):
            if item.exercise_id in excluded:
                continue
            SessionExercise.objects.create(
                user=user,
                session=session,
                exercise=item.exercise,
                template_exercise=item,
                block_priority=block.priority,
                order=order,
            )
            order += 1
    return session


def previous_values(user, exercise: Exercise, gym=None) -> dict:
    """Предзаполнение прошлыми значениями: открыл — там уже веса с прошлого раза."""
    profile = None
    if gym is not None:
        profile = GymExerciseProfile.objects.filter(
            user=user, gym=gym, exercise=exercise
        ).first()

    last_entry = (
        SessionExercise.objects.filter(
            user=user, exercise=exercise, status=SessionExercise.Status.DONE,
            deleted_at__isnull=True,
        )
        .order_by("-session__date", "-id")
        .first()
    )
    sets = []
    if last_entry:
        sets = [
            {
                "set_number": s.set_number,
                "is_warmup": s.is_warmup,
                "weight_kg": s.weight_kg,
                "reps": s.reps,
                "duration_seconds": s.duration_seconds,
                "rir": s.rir,
            }
            for s in last_entry.sets.filter(deleted_at__isnull=True)
        ]
    return {
        "weight_steps": profile.weight_steps if profile else [],
        "step_kg": profile.step_kg if profile else None,
        "last_weight_kg": profile.last_weight_kg if profile else None,
        "last_reps": profile.last_reps if profile else None,
        "machine_number": profile.machine_number if profile else "",
        "seat_settings": profile.seat_settings if profile else "",
        "last_session_date": last_entry.session.date if last_entry else None,
        "last_sets": sets,
    }


# --------------------------------------------------------------------------
# запись подхода
# --------------------------------------------------------------------------
def apply_set_effects(set_log: SetLog) -> None:
    """Побочные эффекты записи подхода: профиль зала, рекорды, тоннаж."""
    session_exercise = set_log.session_exercise
    session = session_exercise.session
    user = session.user

    if session.gym_id and not set_log.is_warmup:
        profile, _ = GymExerciseProfile.objects.get_or_create(
            user=user, gym_id=session.gym_id, exercise_id=session_exercise.exercise_id
        )
        updates = []
        if set_log.weight_kg is not None:
            profile.last_weight_kg = set_log.weight_kg
            updates.append("last_weight_kg")
        if set_log.reps is not None:
            profile.last_reps = set_log.reps
            updates.append("last_reps")
        if set_log.duration_seconds is not None:
            profile.last_duration_seconds = set_log.duration_seconds
            updates.append("last_duration_seconds")
        if updates:
            profile.save(update_fields=updates + ["updated_at"])

    if session.started_at is None:
        session.started_at = set_log.completed_at or timezone.now()
        session.status = WorkoutSession.Status.IN_PROGRESS
        session.save(update_fields=["started_at", "status", "updated_at"])

    update_personal_records(set_log)
    session.recalculate()


def update_personal_records(set_log: SetLog) -> list[PersonalRecord]:
    """Личные рекорды с датой. Разминочные подходы не участвуют."""
    if set_log.is_warmup:
        return []
    session_exercise = set_log.session_exercise
    user = session_exercise.session.user
    exercise = session_exercise.exercise
    on = session_exercise.session.date
    beaten = []

    candidates: list[tuple[str, Decimal | None]] = []
    if set_log.weight_kg is not None:
        candidates.append((PersonalRecord.Kind.MAX_WEIGHT, Decimal(set_log.weight_kg)))
    if set_log.reps is not None:
        candidates.append((PersonalRecord.Kind.MAX_REPS, Decimal(set_log.reps)))
    if set_log.duration_seconds is not None:
        candidates.append(
            (PersonalRecord.Kind.MAX_DURATION, Decimal(set_log.duration_seconds))
        )
    est = set_log.estimated_1rm()
    if est is not None:
        candidates.append((PersonalRecord.Kind.EST_1RM, est))
    volume = set_log.tonnage()
    if volume:
        candidates.append((PersonalRecord.Kind.MAX_SET_VOLUME, volume))

    for kind, value in candidates:
        if value is None:
            continue
        record = PersonalRecord.objects.filter(
            user=user, exercise=exercise, kind=kind
        ).first()
        if record is None:
            beaten.append(
                PersonalRecord.objects.create(
                    user=user, exercise=exercise, kind=kind, value=value,
                    achieved_on=on, set_log=set_log, gym=session_exercise.session.gym,
                )
            )
        elif value > record.value:
            record.value = value
            record.achieved_on = on
            record.set_log = set_log
            record.gym = session_exercise.session.gym
            record.save(update_fields=["value", "achieved_on", "set_log", "gym", "updated_at"])
            beaten.append(record)
    return beaten


# --------------------------------------------------------------------------
# прогрессия и предупреждения
# --------------------------------------------------------------------------
def _working_sets(user, exercise, since: date):
    return SetLog.objects.filter(
        session_exercise__session__user=user,
        session_exercise__exercise=exercise,
        session_exercise__session__date__gte=since,
        is_warmup=False,
        deleted_at__isnull=True,
    ).select_related("session_exercise__session")


def analyze_exercise(user, exercise: Exercise, gym=None) -> list[dict]:
    """Подсказки по одному упражнению. Ничего не сохраняет — только считает."""
    today = timezone.localdate()
    hints: list[dict] = []

    last_entry = (
        SessionExercise.objects.filter(
            user=user, exercise=exercise, status=SessionExercise.Status.DONE,
            deleted_at__isnull=True,
        )
        .order_by("-session__date", "-id")
        .first()
    )

    # 1. можно прибавить
    if last_entry and exercise.load_type == LoadType.WEIGHT_REPS:
        sets = list(last_entry.sets.filter(is_warmup=False, deleted_at__isnull=True))
        target = last_entry.template_exercise
        top_rep = target.target_reps_max if target and target.target_reps_max else None
        if sets and top_rep:
            all_at_top = all((s.reps or 0) >= top_rep for s in sets)
            rir_ok = all(
                s.rir is None or s.rir >= CONF["PROGRESSION_MIN_RIR"] for s in sets
            )
            has_rir = any(s.rir is not None for s in sets)
            if all_at_top and rir_ok and has_rir:
                current = max((s.weight_kg or Decimal(0)) for s in sets)
                profile = (
                    GymExerciseProfile.objects.filter(user=user, gym=gym, exercise=exercise).first()
                    if gym
                    else None
                )
                nxt = profile.next_step(current) if profile else current + Decimal("2.5")
                hints.append({
                    "kind": ProgressionSuggestion.Kind.INCREASE,
                    "suggested_weight_kg": nxt,
                    "message": f"Все подходы в верхе диапазона и есть запас — попробуй {nxt} кг.",
                })

    # 2. резкий скачок: мышцы адаптируются быстрее связок
    window = CONF["SPIKE_WINDOW_DAYS"]
    recent = _working_sets(user, exercise, today - timedelta(days=window))
    earlier = _working_sets(user, exercise, today - timedelta(days=window * 2)).filter(
        session_exercise__session__date__lt=today - timedelta(days=window)
    )
    recent_max = max((s.weight_kg or Decimal(0) for s in recent), default=Decimal(0))
    earlier_max = max((s.weight_kg or Decimal(0) for s in earlier), default=Decimal(0))
    if earlier_max > 0 and recent_max > 0:
        growth = (recent_max - earlier_max) / earlier_max * 100
        if growth > Decimal(str(CONF["SPIKE_WARNING_PERCENT"])):
            hints.append({
                "kind": ProgressionSuggestion.Kind.SPIKE,
                "message": (
                    f"+{growth:.0f}% за неделю ({earlier_max} → {recent_max} кг). "
                    "Связки адаптируются медленнее мышц — может, задержаться на этом весе?"
                ),
                "payload": {"from": float(earlier_max), "to": float(recent_max)},
            })

    # 3. застой
    weeks = CONF["STALL_WEEKS"]
    stall_since = today - timedelta(weeks=weeks)
    stall_sets = _working_sets(user, exercise, stall_since)
    if stall_sets.count() >= weeks:
        weights = [s.weight_kg or Decimal(0) for s in stall_sets]
        if weights and max(weights) == min(weights):
            hints.append({
                "kind": ProgressionSuggestion.Kind.STALL,
                "message": f"{weeks} недели без прогресса. Сменить схему подходов?",
            })

    # 4. порядок: пропущено N раз подряд
    streak = skip_streak(user, exercise)
    if streak >= CONF["SKIP_STREAK_HINT"]:
        hints.append({
            "kind": ProgressionSuggestion.Kind.ORDER_HINT,
            "message": (
                f"Пропущено {streak} раз подряд. Упражнения в конце тренировки "
                "теряются — попробуй поставить раньше."
            ),
            "payload": {"skip_streak": streak},
        })
    return hints


def skip_streak(user, exercise: Exercise) -> int:
    """Сколько раз подряд упражнение не было сделано."""
    entries = (
        SessionExercise.objects.filter(user=user, exercise=exercise, deleted_at__isnull=True)
        .exclude(session__status=WorkoutSession.Status.PLANNED)
        .order_by("-session__date", "-id")[:20]
    )
    streak = 0
    for entry in entries:
        if entry.status == SessionExercise.Status.DONE:
            break
        streak += 1
    return streak


def deload_suggestion(user) -> dict | None:
    """Автопредложение разгрузочной недели каждые 6–8 недель непрерывных тренировок."""
    today = timezone.localdate()
    weeks = CONF["DELOAD_AFTER_WEEKS"]
    streak = 0
    for index in range(weeks + 2):
        week_end = today - timedelta(days=7 * index)
        week_start = week_end - timedelta(days=6)
        count = WorkoutSession.objects.filter(
            user=user, date__range=(week_start, week_end),
            status=WorkoutSession.Status.COMPLETED, deleted_at__isnull=True,
        ).count()
        if count >= 2:
            streak += 1
        else:
            break
    if streak >= weeks:
        return {
            "kind": ProgressionSuggestion.Kind.DELOAD,
            "message": (
                f"{streak} недель подряд без передышки. Разгрузочная неделя "
                "сейчас обычно даёт скачок потом."
            ),
            "payload": {"weeks": streak},
        }
    return None


def volume_by_muscle(user, date_from: date, date_to: date) -> dict:
    """Объём по мышечным группам + предупреждение о дисбалансе жимов и тяг."""
    rows = (
        SetLog.objects.filter(
            session_exercise__session__user=user,
            session_exercise__session__date__range=(date_from, date_to),
            is_warmup=False,
            deleted_at__isnull=True,
        )
        .values(
            "session_exercise__exercise__muscle_links__muscle__group",
            "session_exercise__exercise__muscle_links__role",
        )
        .annotate(sets=Count("id"), tonnage=Sum("weight_kg"))
    )
    by_group: dict[str, int] = {}
    for row in rows:
        group = row["session_exercise__exercise__muscle_links__muscle__group"]
        if not group or row["session_exercise__exercise__muscle_links__role"] != "primary":
            continue
        by_group[group] = by_group.get(group, 0) + row["sets"]

    push_pull = (
        SetLog.objects.filter(
            session_exercise__session__user=user,
            session_exercise__session__date__range=(date_from, date_to),
            is_warmup=False,
            deleted_at__isnull=True,
        )
        .aggregate(
            push=Count("id", filter=Q(session_exercise__exercise__movement_tags__is_push=True)),
            pull=Count("id", filter=Q(session_exercise__exercise__movement_tags__is_pull=True)),
        )
    )
    warning = None
    push, pull = push_pull["push"] or 0, push_pull["pull"] or 0
    ratio_limit = CONF["PUSH_PULL_IMBALANCE_RATIO"]
    if pull and push / pull > ratio_limit:
        warning = f"Жимов в {push / pull:.1f} раза больше, чем тяг ({push} против {pull})."
    elif push and pull / push > ratio_limit:
        warning = f"Тяг в {pull / push:.1f} раза больше, чем жимов ({pull} против {push})."

    return {
        "sets_by_muscle_group": by_group,
        "push_sets": push,
        "pull_sets": pull,
        "imbalance_warning": warning,
    }


def discipline_stats(user, date_from: date, date_to: date) -> dict:
    """Дисциплина: пропуск по внешней причине её не портит."""
    from apps.recovery.models import IllnessPeriod

    illness = IllnessPeriod.objects.filter(
        user=user, date_from__lte=date_to
    ).filter(Q(date_to__isnull=True) | Q(date_to__gte=date_from))
    illness_days = set()
    for period in illness:
        current = max(period.date_from, date_from)
        end = min(period.date_to or date_to, date_to)
        while current <= end:
            illness_days.add(current)
            current += timedelta(days=1)

    entries = SessionExercise.objects.filter(
        user=user, session__date__range=(date_from, date_to), deleted_at__isnull=True
    ).select_related("fail_reason", "session")

    done = counted_misses = excused = skipped = 0
    for entry in entries:
        if entry.session.date in illness_days:
            continue
        if entry.status == SessionExercise.Status.DONE:
            done += 1
        elif entry.status == SessionExercise.Status.SKIPPED:
            skipped += 1
        elif entry.status == SessionExercise.Status.FAILED:
            if entry.counts_against_discipline:
                counted_misses += 1
            else:
                excused += 1

    denominator = done + counted_misses
    return {
        "done": done,
        "skipped_by_choice": skipped,
        "excused": excused,
        "counted_misses": counted_misses,
        "illness_days_excluded": len(illness_days),
        "discipline_percent": round(done / denominator * 100) if denominator else None,
    }


def session_completion(session: WorkoutSession) -> dict:
    """Выполнен ли день. Закрыт обязательный блок — значит да."""
    counts = {"required": [0, 0], "main": [0, 0], "optional": [0, 0]}
    for entry in session.exercises.filter(deleted_at__isnull=True):
        bucket = counts.setdefault(entry.block_priority, [0, 0])
        bucket[1] += 1
        if entry.status == SessionExercise.Status.DONE:
            bucket[0] += 1
    return {
        "required_done": session.required_done,
        "blocks": {
            key: {"done": value[0], "total": value[1]} for key, value in counts.items()
        },
        "priority_labels": dict(BlockPriority.choices),
    }
