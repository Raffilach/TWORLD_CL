from datetime import timedelta

from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from rest_framework.views import APIView

from apps.core.viewsets import OwnedModelViewSet

from .builders import build_context, to_markdown
from .models import PlanImport
from .plan_import import materialize, parse


class ContextView(APIView):
    """Полный контекст для ИИ-тренера.

    `GET /api/context/` — вся история, `?from=&to=` — период.
    `format=markdown` отдаёт готовый к вставке в диалог текст.
    Дневник не попадает в выдачу без явного `include_journal=1`.
    """

    @extend_schema(
        parameters=[
            OpenApiParameter("from", str), OpenApiParameter("to", str),
            OpenApiParameter("format", str, description="json | markdown"),
            OpenApiParameter("sections", str, description="через запятую"),
            OpenApiParameter("include_journal", bool),
        ],
        responses={200: dict},
    )
    def get(self, request):
        date_from = parse_date(request.query_params.get("from", "") or "")
        date_to = parse_date(request.query_params.get("to", "") or "")
        sections = request.query_params.get("sections")
        data = build_context(
            request.user,
            date_from=date_from,
            date_to=date_to,
            sections=set(sections.split(",")) if sections else None,
            include_journal=request.query_params.get("include_journal") in {"1", "true"},
        )
        if request.query_params.get("format") == "markdown":
            return HttpResponse(to_markdown(data), content_type="text/markdown; charset=utf-8")
        return Response(data)


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: WorkoutMarkdownView
class WorkoutMarkdownView(APIView):
    """«Скопировать для ИИ» для одной тренировки — компактный markdown."""

    def get(self, request, pk):
        from apps.training.models import WorkoutSession

        session = WorkoutSession.objects.filter(
            user=request.user, pk=pk, deleted_at__isnull=True
        ).first()
        if session is None:
            return Response({"detail": "Не найдено."}, status=404)
        data = build_context(
            request.user, date_from=session.date, date_to=session.date,
            sections={"profile", "workouts", "limits", "injuries"},
        )
        return HttpResponse(to_markdown(data), content_type="text/markdown; charset=utf-8")


class PlanImportView(APIView):
    """Приём рекомендаций обратно: markdown или JSON → шаблон тренировки."""

    @extend_schema(request=None, responses={201: dict})
    def post(self, request):
        raw_text = request.data.get("text", "")
        fmt = request.data.get("format", "markdown")
        dry_run = request.data.get("dry_run") in {True, "1", "true"}
        if not raw_text.strip():
            return Response({"text": ["Пустой план."]}, status=400)

        parsed = parse(raw_text, fmt)
        record = PlanImport.objects.create(
            user=request.user, raw_text=raw_text, format=fmt,
            parsed=parsed, errors=parsed.get("errors", []),
            status="parsed" if not parsed.get("errors") else "error",
        )
        if parsed.get("errors"):
            return Response(
                {"id": record.id, "parsed": parsed, "errors": parsed["errors"]}, status=400
            )
        if dry_run:
            return Response({"id": record.id, "parsed": parsed, "created": False})

        template, new_exercises = materialize(request.user, parsed)
        record.created_template = template
        record.status = "imported"
        record.save(update_fields=["created_template", "status", "updated_at"])

        from apps.training.serializers import WorkoutTemplateSerializer

        return Response({
            "id": record.id,
            "template": WorkoutTemplateSerializer(template).data,
            "created_exercises": new_exercises,
            "parsed": parsed,
        }, status=status.HTTP_201_CREATED)
