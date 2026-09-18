from rest_framework import serializers

from apps.core.serializers import OwnedModelSerializer

from . import models as m


class WeeklyReportSerializer(OwnedModelSerializer):
    share_url = serializers.SerializerMethodField()

    class Meta:
        model = m.WeeklyReport
        fields = [
            "id", "week_start", "variant", "blocks_config", "stats", "headline_metric",
            "verdict", "weak_link", "focus_next_week", "pdf", "generated_at", "share_url",
        ]
        read_only_fields = ["stats", "headline_metric", "verdict", "weak_link",
                            "focus_next_week", "pdf", "generated_at"]

    def get_share_url(self, obj) -> str | None:
        if obj.share_link_id is None or not obj.share_link.is_active:
            return None
        request = self.context.get("request")
        path = f"/s/{obj.share_link.slug}"
        return request.build_absolute_uri(path) if request else path
