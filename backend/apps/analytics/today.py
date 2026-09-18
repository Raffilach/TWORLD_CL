"""Агрегат для экрана «Сегодня».

Один запрос отдаёт всё, что нужно главному экрану: без этого
первый экран собирался бы из десяти запросов и тормозил в метро.
"""
from datetime import timedelta

from django.db.models import Sum
from django.utils import timezone
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.views import APIView


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: TodayView
class TodayView(APIView):
    def get(self, request):
        from apps.body.services import trend_summary
        from apps.habits.models import Habit
        from apps.habits.services import habit_stats
        from apps.journal.models import DailyLog
        from apps.nutrition.models import MealEntry, Supplement, SupplementLog, WaterLog
        from apps.recovery.models import SleepEntry
        from apps.recovery.services import evening_plan, short_sleep_warning
        from apps.safety.models import RecurrenceNotice
        from apps.training.models import TemplateSchedule, WorkoutSession
        from apps.training.serializers import (
            WorkoutSessionSerializer,
            WorkoutTemplateSerializer,
        )

        user = request.user
        today = timezone.localdate()
        settings_obj = getattr(user, "settings", None)

        # --- вес: тренд крупно, сырое значение вторично --------------------
        weight = trend_summary(user, today)

        # --- тренировка ----------------------------------------------------
        session = WorkoutSession.objects.filter(
            user=user, date=today, deleted_at__isnull=True
        ).order_by("-started_at").first()
        planned = TemplateSchedule.objects.filter(
            template__user=user, template__is_active=True, weekday=today.weekday()
        ).select_related("template").first()
        next_planned = None
        if planned is None:
            for offset in range(1, 8):
                day = today + timedelta(days=offset)
                upcoming = TemplateSchedule.objects.filter(
                    template__user=user, template__is_active=True, weekday=day.weekday()
                ).select_related("template").first()
                if upcoming:
                    next_planned = {"date": day, "template": WorkoutTemplateSerializer(
                        upcoming.template
                    ).data}
                    break

        # --- питание --------------------------------------------------------
        protein = MealEntry.objects.filter(
            user=user, at__date=today, deleted_at__isnull=True
        ).aggregate(total=Sum("protein_g"))["total"] or 0
        water = WaterLog.objects.filter(
            user=user, at__date=today, deleted_at__isnull=True
        ).aggregate(total=Sum("volume_ml"))["total"] or 0
        supplements = [
            {
                "id": item.id,
                "name": item.name,
                "taken": SupplementLog.objects.filter(
                    supplement=item, date=today, taken=True, deleted_at__isnull=True
                ).exists(),
            }
            for item in Supplement.objects.filter(user=user, is_active=True)
        ]

        # --- сон -------------------------------------------------------------
        sleep = SleepEntry.objects.filter(
            user=user, night_of=today - timedelta(days=1), deleted_at__isnull=True
        ).order_by("-updated_at").first()
        last_sleep = SleepEntry.objects.filter(
            user=user, deleted_at__isnull=True, bed_time__isnull=False
        ).order_by("-night_of").first()

        # --- привычки ---------------------------------------------------------
        habits = [
            {"id": habit.id, "name": habit.name, "kind": habit.kind, **habit_stats(habit, today)}
            for habit in Habit.objects.filter(user=user, is_active=True)
        ]

        # --- настроение --------------------------------------------------------
        daily = DailyLog.objects.filter(user=user, date=today, deleted_at__isnull=True).first()

        blocks = {
            "weight": weight.get("raw_kg") is not None or weight.get("trend_kg") is not None,
            "workout": session is not None and session.status == WorkoutSession.Status.COMPLETED,
            "protein": float(protein) > 0,
            "water": water > 0,
            "supplements": all(item["taken"] for item in supplements) if supplements else None,
            "sleep": sleep is not None,
            "mood_energy": bool(daily and (daily.mood_1_5 or daily.energy_1_5)),
        }
        tracked = [value for value in blocks.values() if value is not None]

        return Response({
            "date": today,
            "layout": getattr(settings_obj, "today_blocks", []),
            "weight": {
                **weight,
                "placeholder_kg": weight.get("raw_kg"),
                "conditions_default": {"morning": True, "fasted": True},
            },
            "workout": {
                "session": WorkoutSessionSerializer(session).data if session else None,
                "planned_template": WorkoutTemplateSerializer(planned.template).data
                if planned else None,
                "next_planned": next_planned,
            },
            "nutrition": {
                "protein_done_g": float(protein),
                "protein_target_g": getattr(settings_obj, "protein_target_g", 150),
                "water_done_ml": water,
                "water_target_ml": getattr(settings_obj, "water_target_ml", 2000),
                "water_glass_ml": getattr(settings_obj, "water_glass_ml", 250),
                "supplements": supplements,
            },
            "sleep": {
                "last_night": {
                    "duration_minutes": sleep.duration_minutes if sleep else None,
                    "bed_time": sleep.bed_time if sleep else None,
                    "wake_time": sleep.wake_time if sleep else None,
                    "source": sleep.source if sleep else None,
                },
                "prefill": {
                    "bed_time": last_sleep.bed_time.strftime("%H:%M") if last_sleep and last_sleep.bed_time else None,
                    "wake_time": last_sleep.wake_time.strftime("%H:%M") if last_sleep and last_sleep.wake_time else None,
                },
                "warning": short_sleep_warning(user, today),
            },
            "habits": habits,
            "mood_energy": {
                "mood_1_5": daily.mood_1_5 if daily else None,
                "energy_1_5": daily.energy_1_5 if daily else None,
            },
            "evening_plan": evening_plan(user),
            "safety_notices": [
                {
                    "id": notice.id,
                    "body_part": notice.body_part.name_ru,
                    "days_between": notice.days_between,
                }
                for notice in RecurrenceNotice.objects.filter(
                    user=user, acknowledged_at__isnull=True
                ).select_related("body_part")
            ],
            "day_progress": {
                "done": sum(1 for value in tracked if value),
                "total": len(tracked),
                # Пустое состояние показывается нейтрально: пропуск — это данные.
                "tone": "neutral",
            },
        })
