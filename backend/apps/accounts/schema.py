"""Описание схемы аутентификации по токену для OpenAPI."""
from drf_spectacular.extensions import OpenApiAuthenticationExtension


class ApiTokenScheme(OpenApiAuthenticationExtension):
    target_class = "apps.accounts.authentication.ApiTokenAuthentication"
    name = "ApiToken"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization",
            "description": (
                "Персональный токен пользователя: `Authorization: Token twk_...`. "
                "Токены со скоупом `read` не могут изменять данные."
            ),
        }
