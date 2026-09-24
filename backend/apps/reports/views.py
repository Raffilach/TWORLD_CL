from datetime import timedelta

from django.core.files.base import ContentFile
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import ShareLink
from apps.analytics.services import week_bounds
from apps.core.viewsets import OwnedModelViewSet

from . import models as m
from . import serializers as s
from .render import render_html, render_pdf
from .services import collect_report_data


def _json_safe(value):
    from datetime import date, datetime
    from decimal import Decimal

    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


class WeeklyReportViewSet(OwnedModelViewSet):
    serializer_class = s.WeeklyReportSerializer
    queryset = m.WeeklyReport.objects.select_related("share_link")
    filterset_fields = ["week_start", "variant"]

    def create(self, request, *args, **kwargs):
        """Генерация отчёта. Две версии: «для тренера» и «для себя»."""
        anchor = parse_date(request.data.get("week_of", "") or "") or timezone.localdate()
        week_start, _ = week_bounds(anchor)
        variant = request.data.get("variant", m.WeeklyReport.Variant.SELF)
        blocks = request.data.get("blocks") or m.default_blocks_config()
        if variant == m.WeeklyReport.Variant.SELF:
            # Короткая версия: без детальных таблиц по подходам.
            blocks = {**blocks, "workouts": False, "exercise_charts": False, "skipped": False}

        data = collect_report_data(request.user, week_start)
        report, _ = m.WeeklyReport.objects.update_or_create(
            user=request.user, week_start=week_start, variant=variant,
            defaults={
                "blocks_config": blocks,
                "stats": _json_safe(data),
                "headline_metric": f"{data['headline']['value']} — {data['headline']['label']}",
                "verdict": data["verdict"],
                "weak_link": f"{data['weak_link'].get('title')}: {data['weak_link'].get('detail')}",
                "focus_next_week": data["weak_link"].get("focus", ""),
            },
        )
        html = render_html(request.user, data, variant, blocks)
        pdf = render_pdf(html)
        if pdf:
            report.pdf.save(f"tworld-week-{week_start}-{variant}.pdf", ContentFile(pdf), save=True)
        payload = self.get_serializer(report).data
        payload["pdf_available"] = bool(pdf)
        if not pdf:
            payload["pdf_note"] = (
                "WeasyPrint не установлен в этом окружении — отчёт доступен как "
                "печатаемый HTML (Печать → Сохранить как PDF даёт тот же A4)."
            )
        return Response(payload, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def html(self, request, pk=None):
        report = self.get_object()
        data = collect_report_data(request.user, report.week_start)
        return HttpResponse(
            render_html(request.user, data, report.variant, report.blocks_config)
        )

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        report = self.get_object()
        data = collect_report_data(request.user, report.week_start)
        html = render_html(request.user, data, report.variant, report.blocks_config)
        pdf = render_pdf(html)
        if pdf is None:
            return HttpResponse(html)
        response = HttpResponse(pdf, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="tworld-week-{report.week_start}.pdf"'
        )
        return response

    @action(detail=True, methods=["get"])
    def markdown(self, request, pk=None):
        """«Скопировать для ИИ» — компактный markdown недели."""
        from apps.aicontext.builders import build_context, to_markdown

        report = self.get_object()
        data = build_context(
            request.user,
            date_from=report.week_start,
            date_to=report.week_start + timedelta(days=6),
        )
        return HttpResponse(to_markdown(data), content_type="text/markdown; charset=utf-8")

    @action(detail=True, methods=["post"])
    def share(self, request, pk=None):
        """Публичная ссылка только на чтение, с возможностью отозвать."""
        report = self.get_object()
        if report.share_link and report.share_link.is_active:
            link = report.share_link
        else:
            link = ShareLink.objects.create(
                user=request.user,
                kind=ShareLink.Kind.WEEKLY_REPORT,
                object_id=str(report.id),
                period_from=report.week_start,
                period_to=report.week_start + timedelta(days=6),
                expires_at=timezone.now() + timedelta(days=int(request.data.get("days", 30))),
            )
            report.share_link = link
            report.save(update_fields=["share_link", "updated_at"])
        return Response({
            "slug": link.slug,
            "url": request.build_absolute_uri(f"/s/{link.slug}"),
            "expires_at": link.expires_at,
        })


@extend_schema(responses={200: OpenApiTypes.STR}, auth=[])
class PublicReportView(APIView):
    """Отчёт по публичной ссылке. Только чтение, легко отозвать."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        link = get_object_or_404(ShareLink, slug=slug)
        if not link.is_active:
            return HttpResponse(
                "<h1>Ссылка отозвана</h1><p>Владелец закрыл доступ к этому отчёту.</p>",
                status=410,
            )
        report = m.WeeklyReport.objects.filter(
            user=link.user, pk=link.object_id or 0
        ).first()
        if report is None:
            return HttpResponse("<h1>Отчёт не найден</h1>", status=404)
        ShareLink.objects.filter(pk=link.pk).update(view_count=link.view_count + 1)
        data = collect_report_data(link.user, report.week_start)
        return HttpResponse(
            render_html(link.user, data, report.variant, report.blocks_config)
        )
