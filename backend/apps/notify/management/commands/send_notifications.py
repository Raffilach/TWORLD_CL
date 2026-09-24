"""Рассылка запланированных уведомлений.

Запускается по расписанию (cron каждые пять минут):
    */5 * * * * python manage.py send_notifications

Команда сама следит за лимитом «не больше N в день», тихими часами
и за тем, чтобы одно и то же уведомление не ушло дважды.
"""
from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import User
from apps.notify.models import NotificationLog, NotificationSettings
from apps.notify.push import is_configured, send_to_user


class Command(BaseCommand):
    help = "Отправляет уведомления, время которых наступило."

    def add_arguments(self, parser):
        parser.add_argument("--window", type=int, default=10, help="Окно в минутах.")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        if not is_configured() and not options["dry_run"]:
            self.stdout.write(self.style.WARNING(
                "VAPID не настроен. Ключи: python manage.py generate_vapid_keys"
            ))
            return

        now = timezone.localtime()
        window = timedelta(minutes=options["window"])
        total = 0

        for user in User.objects.filter(is_active=True):
            settings_obj = NotificationSettings.objects.filter(user=user).first()
            if settings_obj is None or not settings_obj.push_enabled:
                continue

            sent_today = NotificationLog.objects.filter(
                user=user, sent_at__date=now.date()
            ).count()
            if sent_today >= settings_obj.max_per_day:
                continue

            for item in self._due(user, settings_obj, now, window):
                if self._in_quiet_hours(settings_obj, now.time()):
                    continue
                if NotificationLog.objects.filter(
                    user=user, kind=item["kind"], scheduled_for__date=now.date()
                ).exists():
                    continue

                NotificationLog.objects.create(
                    user=user, kind=item["kind"], scheduled_for=now, payload=item
                )
                if options["dry_run"]:
                    self.stdout.write(f"{user.username}: {item['title']} — {item['body']}")
                    total += 1
                else:
                    total += send_to_user(user, item)
                sent_today += 1
                if sent_today >= settings_obj.max_per_day:
                    break

        self.stdout.write(self.style.SUCCESS(f"Отправлено: {total}"))

    def _due(self, user, settings_obj, now, window):
        """Какие уведомления должны уйти прямо сейчас."""
        items = []
        user_settings = getattr(user, "settings", None)

        if settings_obj.morning_weigh_in_enabled and self._near(
            now, settings_obj.morning_weigh_in_time, window
        ):
            items.append({
                "kind": "morning_weigh_in",
                "title": "Доброе утро",
                "body": "Взвесишься? Это займёт пару секунд.",
                "url": "/",
                "actions": [{"action": "weight", "title": "Ввести вес"}],
            })

        if settings_obj.bedtime_reminder_enabled and user_settings:
            target = (
                datetime.combine(now.date(), user_settings.bedtime_goal)
                - timedelta(minutes=settings_obj.bedtime_reminder_minutes_before)
            ).time()
            if self._near(now, target, window):
                items.append({
                    "kind": "bedtime",
                    "title": "Скоро время отбоя",
                    "body": (
                        f"Через {settings_obj.bedtime_reminder_minutes_before} минут — "
                        f"целевое время {user_settings.bedtime_goal.strftime('%H:%M')}."
                    ),
                    "url": "/",
                })

        if settings_obj.habit_risk_reminder_enabled:
            from apps.habits.services import craving_patterns

            hour = craving_patterns(user).get("riskiest_hour")
            if hour is not None and self._near(now, time(hour, 0), window):
                items.append({
                    "kind": "habit_risk",
                    "title": "Заменители под рукой",
                    "body": "Обычно в это время бывает тяга. Она проходит сама.",
                    "url": "/?sos=1",
                })

        return items

    @staticmethod
    def _near(now, target: time, window: timedelta) -> bool:
        target_dt = timezone.make_aware(datetime.combine(now.date(), target), now.tzinfo)
        return timedelta(0) <= (now - target_dt) < window

    @staticmethod
    def _in_quiet_hours(settings_obj, current: time) -> bool:
        start, end = settings_obj.quiet_hours_from, settings_obj.quiet_hours_to
        if start == end:
            return False
        if start < end:
            return start <= current < end
        return current >= start or current < end
