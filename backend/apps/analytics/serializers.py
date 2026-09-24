from apps.core.serializers import OwnedModelSerializer

from . import models as m


class InsightSerializer(OwnedModelSerializer):
    class Meta:
        model = m.Insight
        fields = ["id", "period_from", "period_to", "kind", "payload", "created_at"]


class StandardSerializer(OwnedModelSerializer):
    class Meta:
        model = m.Standard
        fields = [
            "id", "name", "source", "exercise", "target_value", "unit",
            "deadline", "current_value",
        ]
