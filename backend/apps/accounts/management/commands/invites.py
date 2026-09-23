"""Коды приглашений на бету из консоли сервера.

    python manage.py invites create --count 10 --note "бета, волна 1"
    python manage.py invites create --uses 20 --days 14      # один код на 20 человек
    python manage.py invites list
    python manage.py invites revoke ABCD-EFGH
"""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import InviteCode


class Command(BaseCommand):
    help = "Создать, показать или отозвать коды приглашений."

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest="action", required=True)
        create = sub.add_parser("create")
        create.add_argument("--count", type=int, default=1, help="сколько кодов")
        create.add_argument("--uses", type=int, default=1, help="регистраций на один код")
        create.add_argument("--days", type=int, default=0, help="срок действия, дней (0 — бессрочно)")
        create.add_argument("--note", default="", help="для кого")
        sub.add_parser("list")
        revoke = sub.add_parser("revoke")
        revoke.add_argument("code")

    def handle(self, *args, **options):
        action = options["action"]
        if action == "create":
            expires = (
                timezone.now() + timedelta(days=options["days"]) if options["days"] else None
            )
            for _ in range(options["count"]):
                invite = InviteCode.objects.create(
                    code=InviteCode.generate_code(), max_uses=options["uses"],
                    expires_at=expires, note=options["note"],
                )
                self.stdout.write(f"{invite.code}   {settings.FRONTEND_URL}/?invite={invite.code}")
        elif action == "list":
            for invite in InviteCode.objects.all():
                state = "активен" if invite.is_usable else "не действует"
                self.stdout.write(
                    f"{invite.code}  {invite.used_count}/{invite.max_uses}  {state}  {invite.note}"
                )
        elif action == "revoke":
            updated = InviteCode.objects.filter(code=InviteCode.normalize(options["code"])).update(
                is_active=False
            )
            if not updated:
                raise CommandError("Такого кода нет.")
            self.stdout.write("Код отозван.")
