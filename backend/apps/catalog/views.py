from apps.core.viewsets import ReadOnlyCatalogViewSet

from . import serializers as s
from . import models as m


class MuscleViewSet(ReadOnlyCatalogViewSet):
    queryset = m.Muscle.objects.all()
    serializer_class = s.MuscleSerializer


class EquipmentViewSet(ReadOnlyCatalogViewSet):
    queryset = m.Equipment.objects.all()
    serializer_class = s.EquipmentSerializer


class BodyPartViewSet(ReadOnlyCatalogViewSet):
    queryset = m.BodyPart.objects.all()
    serializer_class = s.BodyPartSerializer


class MovementTagViewSet(ReadOnlyCatalogViewSet):
    queryset = m.MovementTag.objects.all()
    serializer_class = s.MovementTagSerializer


class FailReasonViewSet(ReadOnlyCatalogViewSet):
    queryset = m.FailReason.objects.all()
    serializer_class = s.FailReasonSerializer


class HealthTimelineViewSet(ReadOnlyCatalogViewSet):
    queryset = m.HealthTimelineItem.objects.all()
    serializer_class = s.HealthTimelineItemSerializer
    filterset_fields = ["habit_kind"]


class CravingTriggerViewSet(ReadOnlyCatalogViewSet):
    queryset = m.CravingTrigger.objects.all()
    serializer_class = s.CravingTriggerSerializer
