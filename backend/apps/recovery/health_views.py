from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from .health_import import ingest
from .serializers import HealthImportSerializer


class HealthImportView(APIView):
    """Приём данных из Apple Shortcuts или выгрузки «Здоровья».

    Формат тела описан в docs/ai-exchange-format.md.
    Повторная отправка тех же данных не создаёт дублей.
    """

    @extend_schema(request=None, responses=HealthImportSerializer)
    def post(self, request):
        source = request.data.get("source", "shortcut")
        result = ingest(request.user, request.data, source=source)
        return Response(HealthImportSerializer(result).data)
