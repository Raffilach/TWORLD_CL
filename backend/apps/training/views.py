from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.viewsets import OwnedModelViewSet
from apps.safety.services import limits_for_exercise

from . import models as m
from . import serializers as s
from .services import (
    analyze_exercise,
    apply_set_effects,
    build_session_from_template,
    deload_suggestion,
    previous_values,
    skip_streak,
    volume_by_muscle,
)


class ExerciseViewSet(OwnedModelViewSet):
    """Библиотека: глобальные упражнения + свои.

    Исключение из общего правила изоляции: глобальные упражнения
    (owner=NULL) видны всем, но редактировать можно только свои.
    """

    serializer_class = s.ExerciseSerializer
    queryset = m.Exercise.objects.select_related("equipment").prefetch_related(
        "muscle_links__muscle", "movement_tags", "alternatives__alternative"
    )
    search_fields = ["name", "aliases"]
    filterset_fields = ["load_type", "equipment", "is_unilateral", "is_archived"]

    def get_queryset(self):
        qs = m.Exercise.objects.select_related("equipment").prefetch_related(
            "muscle_links__muscle", "movement_tags", "alternatives__alternative"
        )
        if not self.request.user.is_authenticated:
            return qs.none()
        return qs.filter(Q(owner__isnull=True) | Q(owner=self.request.user))

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.owner_id is None:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "Это упражнение из общей базы. Скопируйте его в свои, чтобы изменить."
            )
        serializer.save()

    def perform_destroy(self, instance):
        if instance.owner_id is None:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Упражнение из общей базы удалить нельзя.")
        instance.is_archived = True
        instance.save(update_fields=["is_archived", "updated_at"])

    @action(detail=True, methods=["post"])
    def copy(self, request, pk=None):
        """Копия глобального упражнения в личную библиотеку — чтобы править."""
        source = self.get_object()
        clone = m.Exercise.objects.create(
            owner=request.user,
            name=f"{source.name} (моё)",
            load_type=source.load_type,
            equipment=source.equipment,
            is_unilateral=source.is_unilateral,
            bodyweight_factor=source.bodyweight_factor,
            default_rest_seconds=source.default_rest_seconds,
            instructions=source.instructions,
        )
        clone.movement_tags.set(source.movement_tags.all())
        for link in source.muscle_links.all():
            m.ExerciseMuscle.objects.create(
                exercise=clone, muscle=link.muscle, role=link.role
            )
        return Response(self.get_serializer(clone).data, status=status.HTTP_201_CREATED)

    @extend_schema(parameters=[OpenApiParameter("gym", int)])
    @action(detail=True, methods=["get"])
    def prefill(self, request, pk=None):
        """Предзаполнение прошлыми значениями + сетка весов этого зала."""
        exercise = self.get_object()
        gym = m.Gym.objects.filter(user=request.user, pk=request.query_params.get("gym")).first()
        data = previous_values(request.user, exercise, gym)
        data["limits"] = limits_for_exercise(request.user, exercise)
        data["skip_streak"] = skip_streak(request.user, exercise)
        return Response(data)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        """История по упражнению: график веса и повторов, рекорды."""
        exercise = self.get_object()
        sets = (
            m.SetLog.objects.filter(
                session_exercise__session__user=request.user,
                session_exercise__exercise=exercise,
                is_warmup=False,
                deleted_at__isnull=True,
            )
            .select_related("session_exercise__session")
            .order_by("session_exercise__session__date")
        )
        points = [
            {
                "date": item.session_exercise.session.date,
                "weight_kg": item.weight_kg,
                "reps": item.reps,
                "duration_seconds": item.duration_seconds,
                "rir": item.rir,
                "tonnage": item.tonnage(),
            }
            for item in sets
        ]
        records = m.PersonalRecord.objects.filter(user=request.user, exercise=exercise)
        return Response({
            "points": points,
            "records": s.PersonalRecordSerializer(records, many=True).data,
        })

    @extend_schema(parameters=[OpenApiParameter("gym", int)])
    @action(detail=True, methods=["get"])
    def progression(self, request, pk=None):
        exercise = self.get_object()
        gym = m.Gym.objects.filter(user=request.user, pk=request.query_params.get("gym")).first()
        return Response({"hints": analyze_exercise(request.user, exercise, gym)})


class ExerciseAlternativeViewSet(OwnedModelViewSet):
    """Список альтернатив на случай «тренажёр занят»."""

    serializer_class = s.ExerciseAlternativeSerializer
    queryset = m.ExerciseAlternative.objects.all()

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return m.ExerciseAlternative.objects.none()
        return m.ExerciseAlternative.objects.filter(
            Q(owner__isnull=True) | Q(owner=self.request.user)
        ).select_related("alternative")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class GymViewSet(OwnedModelViewSet):
    serializer_class = s.GymSerializer
    queryset = m.Gym.objects.all()


class GymExerciseProfileViewSet(OwnedModelViewSet):
    serializer_class = s.GymExerciseProfileSerializer
    queryset = m.GymExerciseProfile.objects.select_related("gym", "exercise")
    filterset_fields = ["gym", "exercise"]

    @action(detail=True, methods=["get"])
    def steps(self, request, pk=None):
        """Соседние значения по фактической сетке тренажёра."""
        profile = self.get_object()
        current = request.query_params.get("current")
        current = float(current) if current else profile.last_weight_kg
        return Response({
            "current": current,
            "down": profile.next_step(current, -1),
            "up": profile.next_step(current, 1),
            "all": profile.weight_steps,
        })


class WorkoutTemplateViewSet(OwnedModelViewSet):
    serializer_class = s.WorkoutTemplateSerializer
    queryset = m.WorkoutTemplate.objects.prefetch_related(
        "blocks__exercises__exercise", "schedules"
    )

    @action(detail=True, methods=["post"])
    def reorder(self, request, pk=None):
        """Перетаскивание упражнений.

        Порядок имеет значение: упражнение в конце пропускается чаще.
        Тело: {"items": [{"template_exercise": 1, "block": 2, "order": 0}, ...]}
        """
        template = self.get_object()
        items = request.data.get("items", [])
        valid_blocks = set(template.blocks.values_list("id", flat=True))
        updated = 0
        for item in items:
            block_id = item.get("block")
            if block_id is not None and block_id not in valid_blocks:
                return Response({"detail": "Блок не принадлежит шаблону."}, status=400)
            fields = {"order": item.get("order", 0)}
            if block_id is not None:
                fields["block_id"] = block_id
            updated += m.TemplateExercise.objects.filter(
                pk=item.get("template_exercise"), block__template=template
            ).update(**fields)
        return Response({"updated": updated, "template": self.get_serializer(template).data})

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Старт одной кнопкой: план уже развёрнут."""
        template = self.get_object()
        gym = m.Gym.objects.filter(user=request.user, pk=request.data.get("gym")).first()
        session = build_session_from_template(request.user, template, gym)
        return Response(
            s.WorkoutSessionSerializer(session).data, status=status.HTTP_201_CREATED
        )


class TemplateBlockViewSet(OwnedModelViewSet):
    serializer_class = s.TemplateBlockSerializer
    queryset = m.TemplateBlock.objects.all()
    filterset_fields = ["template"]

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return m.TemplateBlock.objects.none()
        return m.TemplateBlock.objects.filter(template__user=self.request.user)

    def perform_create(self, serializer):
        serializer.save()


class TemplateExerciseViewSet(OwnedModelViewSet):
    serializer_class = s.TemplateExerciseSerializer
    queryset = m.TemplateExercise.objects.all()
    filterset_fields = ["block"]

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return m.TemplateExercise.objects.none()
        return m.TemplateExercise.objects.filter(block__template__user=self.request.user)

    def perform_create(self, serializer):
        serializer.save()


class TemplateScheduleViewSet(OwnedModelViewSet):
    serializer_class = s.TemplateScheduleSerializer
    queryset = m.TemplateSchedule.objects.all()
    filterset_fields = ["template", "weekday"]

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return m.TemplateSchedule.objects.none()
        return m.TemplateSchedule.objects.filter(template__user=self.request.user)

    def perform_create(self, serializer):
        serializer.save()


class PlannedExclusionViewSet(OwnedModelViewSet):
    """«Сегодня НЕ делаем» — видно, что это решение, а не забывчивость."""

    serializer_class = s.PlannedExclusionSerializer
    queryset = m.PlannedExclusion.objects.select_related("exercise")


class WorkoutSessionViewSet(OwnedModelViewSet):
    queryset = m.WorkoutSession.objects.select_related("template", "gym").prefetch_related(
        "exercises__sets", "exercises__exercise"
    )
    filterset_fields = ["date", "status", "template", "gym"]

    def get_serializer_class(self):
        if self.action == "list":
            return s.WorkoutSessionListSerializer
        return s.WorkoutSessionSerializer

    @action(detail=True, methods=["post"])
    def finish(self, request, pk=None):
        """Автостоп по завершении: длительность и тоннаж пересчитываются."""
        session = self.get_object()
        session.ended_at = timezone.now()
        session.status = m.WorkoutSession.Status.COMPLETED
        if "wellbeing_1_10" in request.data:
            session.wellbeing_1_10 = request.data["wellbeing_1_10"]
        if "notes" in request.data:
            session.notes = request.data["notes"]
        session.save()
        session.recalculate()
        return Response(s.WorkoutSessionSerializer(session).data)

    @action(detail=False, methods=["post"])
    def start_blank(self, request):
        """Тренировка вне плана."""
        gym = m.Gym.objects.filter(user=request.user, pk=request.data.get("gym")).first()
        session = m.WorkoutSession.objects.create(
            user=request.user,
            gym=gym,
            date=timezone.localdate(),
            status=m.WorkoutSession.Status.IN_PROGRESS,
            started_at=timezone.now(),
        )
        return Response(
            s.WorkoutSessionSerializer(session).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        from .services import session_completion

        session = self.get_object()
        records = m.PersonalRecord.objects.filter(
            user=request.user, achieved_on=session.date
        )
        return Response({
            "session": s.WorkoutSessionSerializer(session).data,
            "completion": session_completion(session),
            "new_records": s.PersonalRecordSerializer(records, many=True).data,
        })


class SessionExerciseViewSet(OwnedModelViewSet):
    serializer_class = s.SessionExerciseSerializer
    queryset = m.SessionExercise.objects.select_related("exercise", "fail_reason").prefetch_related("sets")
    filterset_fields = ["session", "status"]

    @action(detail=True, methods=["post"])
    def mark(self, request, pk=None):
        """Три состояния: сделано / пропущено / не смог.

        Для «не смог» причина обязательна — именно она решает,
        портит ли пропуск статистику дисциплины.
        """
        entry = self.get_object()
        new_status = request.data.get("status")
        if new_status not in m.SessionExercise.Status.values:
            return Response({"status": ["Недопустимое состояние."]}, status=400)
        entry.status = new_status
        if new_status == m.SessionExercise.Status.FAILED:
            from apps.catalog.models import FailReason

            reason = FailReason.objects.filter(code=request.data.get("fail_reason")).first()
            if reason is None:
                return Response(
                    {"fail_reason": ["Укажите причину: она решает, учитывать ли пропуск."]},
                    status=400,
                )
            entry.fail_reason = reason
            entry.fail_reason_note = request.data.get("fail_reason_note", "")
        else:
            entry.fail_reason = None
            entry.fail_reason_note = ""
        entry.save()

        payload = self.get_serializer(entry).data
        if entry.fail_reason and entry.fail_reason.suggests_alternative:
            alternatives = m.ExerciseAlternative.objects.filter(
                exercise=entry.exercise
            ).filter(Q(owner__isnull=True) | Q(owner=request.user))
            payload["alternatives"] = s.ExerciseAlternativeSerializer(
                alternatives, many=True
            ).data
        return Response(payload)

    @action(detail=True, methods=["post"])
    def repeat_last(self, request, pk=None):
        """«Как в прошлый раз» — копирует все подходы упражнения целиком."""
        entry = self.get_object()
        previous = (
            m.SessionExercise.objects.filter(
                user=request.user, exercise=entry.exercise,
                status=m.SessionExercise.Status.DONE, deleted_at__isnull=True,
            )
            .exclude(pk=entry.pk)
            .order_by("-session__date", "-id")
            .first()
        )
        if previous is None:
            return Response({"detail": "Прошлых подходов нет."}, status=404)
        created = []
        for source in previous.sets.filter(deleted_at__isnull=True):
            created.append(
                m.SetLog.objects.create(
                    user=request.user,
                    session_exercise=entry,
                    set_number=source.set_number,
                    is_warmup=source.is_warmup,
                    weight_kg=source.weight_kg,
                    weight_is_per_side=source.weight_is_per_side,
                    reps=source.reps,
                    duration_seconds=source.duration_seconds,
                    distance_m=source.distance_m,
                    completed_at=timezone.now(),
                )
            )
        entry.status = m.SessionExercise.Status.DONE
        entry.save(update_fields=["status", "updated_at"])
        for set_log in created:
            apply_set_effects(set_log)
        return Response(self.get_serializer(entry).data, status=status.HTTP_201_CREATED)


class SetLogViewSet(OwnedModelViewSet):
    serializer_class = s.SetLogSerializer
    queryset = m.SetLog.objects.select_related("session_exercise__session")
    filterset_fields = ["session_exercise", "is_warmup"]

    def perform_create(self, serializer):
        set_log = serializer.save(user=self.request.user)
        if set_log.completed_at is None:
            set_log.completed_at = timezone.now()
            set_log.save(update_fields=["completed_at"])
        apply_set_effects(set_log)

    def perform_update(self, serializer):
        set_log = serializer.save()
        apply_set_effects(set_log)

    def perform_destroy(self, instance):
        session = instance.session_exercise.session
        super().perform_destroy(instance)
        session.recalculate()

    def create(self, request, *args, **kwargs):
        """Ответ включает предупреждение о лимите веса и побитые рекорды."""
        response = super().create(request, *args, **kwargs)
        set_log = m.SetLog.objects.get(pk=response.data["id"])
        warnings = []
        if set_log.weight_kg is not None:
            from apps.safety.services import check_weight_limit

            warning = check_weight_limit(
                request.user, set_log.session_exercise.exercise, set_log.weight_kg, set_log
            )
            if warning:
                warnings.append(warning)
        response.data["warnings"] = warnings
        response.data["session_tonnage_kg"] = set_log.session_exercise.session.tonnage_kg
        return response


class PersonalRecordViewSet(OwnedModelViewSet):
    serializer_class = s.PersonalRecordSerializer
    queryset = m.PersonalRecord.objects.select_related("exercise")
    http_method_names = ["get", "head", "options"]
    filterset_fields = ["exercise", "kind"]


class ProgressionSuggestionViewSet(OwnedModelViewSet):
    serializer_class = s.ProgressionSuggestionSerializer
    queryset = m.ProgressionSuggestion.objects.select_related("exercise")

    @action(detail=False, methods=["get"])
    def overview(self, request):
        """Сводка подсказок: разгрузка, дисбаланс объёма."""
        today = timezone.localdate()
        week_ago = today - timedelta(days=7)
        hints = []
        deload = deload_suggestion(request.user)
        if deload:
            hints.append(deload)
        volume = volume_by_muscle(request.user, week_ago, today)
        if volume["imbalance_warning"]:
            hints.append({
                "kind": m.ProgressionSuggestion.Kind.IMBALANCE,
                "message": volume["imbalance_warning"],
                "payload": volume,
            })
        return Response({"hints": hints, "volume": volume})

    @action(detail=True, methods=["post"])
    def dismiss(self, request, pk=None):
        suggestion = self.get_object()
        suggestion.dismissed_at = timezone.now()
        suggestion.save(update_fields=["dismissed_at", "updated_at"])
        return Response(self.get_serializer(suggestion).data)
