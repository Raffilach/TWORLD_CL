from rest_framework import serializers


class OwnedModelSerializer(serializers.ModelSerializer):
    """Сериализатор пользовательских данных.

    Поле `user` недоступно для записи в принципе: владелец проставляется
    вьюсетом из request.user, подделать его через тело запроса нельзя.
    """

    class Meta:
        abstract = True

    def build_field(self, field_name, info, model_class, nested_depth):
        return super().build_field(field_name, info, model_class, nested_depth)

    def get_fields(self):
        fields = super().get_fields()
        fields.pop("user", None)
        return fields
