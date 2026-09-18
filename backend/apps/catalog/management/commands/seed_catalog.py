"""Заполнение справочников и общей библиотеки упражнений."""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import (
    BodyPart,
    BodyPartMovementRisk,
    CravingTrigger,
    Equipment,
    FailReason,
    HealthTimelineItem,
    MovementTag,
    Muscle,
)
from apps.nutrition.models import FoodItem
from apps.training.models import Exercise, ExerciseAlternative, ExerciseMuscle
from seeds import catalog_data as data


class Command(BaseCommand):
    help = "Заполняет справочники, библиотеку упражнений и базовые продукты."

    @transaction.atomic
    def handle(self, *args, **options):
        for code, ru, en, group in data.MUSCLES:
            Muscle.objects.update_or_create(
                code=code, defaults={"name_ru": ru, "name_en": en, "group": group}
            )
        for code, ru, en in data.EQUIPMENT:
            Equipment.objects.update_or_create(
                code=code, defaults={"name_ru": ru, "name_en": en}
            )
        for code, ru, en, region, view in data.BODY_PARTS:
            BodyPart.objects.update_or_create(
                code=code,
                defaults={"name_ru": ru, "name_en": en, "region": region,
                          "view": view, "svg_path_id": code},
            )
        for code, ru, en, push, pull in data.MOVEMENT_TAGS:
            MovementTag.objects.update_or_create(
                code=code,
                defaults={"name_ru": ru, "name_en": en, "is_push": push, "is_pull": pull},
            )
        for part_code, tag_code, level in data.BODY_PART_RISKS:
            BodyPartMovementRisk.objects.update_or_create(
                body_part=BodyPart.objects.get(code=part_code),
                movement_tag=MovementTag.objects.get(code=tag_code),
                defaults={"level": level},
            )
        for code, ru, en, counts, alt, order in data.FAIL_REASONS:
            FailReason.objects.update_or_create(
                code=code,
                defaults={"name_ru": ru, "name_en": en, "counts_against_discipline": counts,
                          "suggests_alternative": alt, "order": order},
            )
        for code, ru, en, order in data.CRAVING_TRIGGERS:
            CravingTrigger.objects.update_or_create(
                code=code, defaults={"name_ru": ru, "name_en": en, "order": order}
            )
        for kind, hours, ru, en, desc_ru, desc_en in data.HEALTH_TIMELINE:
            HealthTimelineItem.objects.update_or_create(
                habit_kind=kind, hours_after=hours,
                defaults={"title_ru": ru, "title_en": en,
                          "description_ru": desc_ru, "description_en": desc_en},
            )

        for name, load_type, equipment, unilateral, rest, muscles, tags in data.EXERCISES:
            exercise, _ = Exercise.objects.update_or_create(
                owner=None, name=name,
                defaults={
                    "load_type": load_type,
                    "equipment": Equipment.objects.get(code=equipment),
                    "is_unilateral": unilateral,
                    "default_rest_seconds": rest,
                },
            )
            exercise.movement_tags.set(MovementTag.objects.filter(code__in=tags))
            for muscle_code, role in muscles:
                ExerciseMuscle.objects.update_or_create(
                    exercise=exercise, muscle=Muscle.objects.get(code=muscle_code),
                    defaults={"role": role},
                )

        for name, alternatives in data.ALTERNATIVES:
            exercise = Exercise.objects.filter(owner=None, name=name).first()
            if exercise is None:
                continue
            for order, alt_name in enumerate(alternatives):
                alternative = Exercise.objects.filter(owner=None, name=alt_name).first()
                if alternative:
                    ExerciseAlternative.objects.update_or_create(
                        exercise=exercise, alternative=alternative, owner=None,
                        defaults={"order": order},
                    )

        for name, label, grams, protein, kcal, quick in data.FOODS:
            FoodItem.objects.update_or_create(
                owner=None, name=name,
                defaults={"serving_label": label, "serving_grams": grams,
                          "protein_g": protein, "calories": kcal, "is_quick_button": quick},
            )

        self.stdout.write(self.style.SUCCESS(
            f"Справочники готовы: {Muscle.objects.count()} мышц, "
            f"{Exercise.objects.filter(owner=None).count()} упражнений, "
            f"{FoodItem.objects.filter(owner=None).count()} продуктов."
        ))
