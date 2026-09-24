"""Генерация пары ключей VAPID для web-push."""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Генерирует ключи VAPID и печатает их для .env"

    def handle(self, *args, **options):
        import base64

        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec

        private_key = ec.generate_private_key(ec.SECP256R1())
        private_bytes = private_key.private_numbers().private_value.to_bytes(32, "big")
        public_bytes = private_key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )

        def b64(raw: bytes) -> str:
            return base64.urlsafe_b64encode(raw).decode().rstrip("=")

        self.stdout.write(self.style.SUCCESS("Добавьте в .env:\n"))
        self.stdout.write(f"VAPID_PRIVATE_KEY={b64(private_bytes)}")
        self.stdout.write(f"VAPID_PUBLIC_KEY={b64(public_bytes)}")
        self.stdout.write("VAPID_CONTACT_EMAIL=you@example.com")
