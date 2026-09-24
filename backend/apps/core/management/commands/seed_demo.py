"""Демо-пользователь с 90 днями данных.

Сид намеренно содержит «интересные» случаи — иначе половину логики
визуально не проверить: срыв привычки, травму плеча с рецидивом,
резкий скачок веса, трёхнедельный застой, неделю недосыпа
и упражнение, пропущенное шесть раз подряд.
"""
import random
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Profile, UserSettings, User
from apps.analytics.models import Standard
from apps.body.models import BodyCompositionScan, BodyCompositionSegment, BodyMeasurement, WeightEntry
from apps.body.services import rebuild_trend
from apps.catalog.models import BodyPart, CravingTrigger, FailReason
from apps.habits.models import Challenge, ChallengeEntry, CravingLog, Habit, HabitEpisode, Replacement
from apps.journal.models import DailyLog, JournalEntry, LifeEvent
from apps.notify.models import NotificationSettings
from apps.nutrition.models import DietExceptionLog, FoodItem, MealEntry, MealEntryItem, Supplement, SupplementLog, WaterLog
from apps.recovery.models import SleepEntry
from apps.safety.models import Injury, InjuryLog, WeightLimit
from apps.safety.services import auto_flag_exercises, check_recurrence
from apps.training.models import (
    Exercise,
    Gym,
    GymExerciseProfile,
    SessionExercise,
    SetLog,
    TemplateBlock,
    TemplateExercise,
    TemplateSchedule,
    WorkoutSession,
    WorkoutTemplate,
)
from apps.training.services import apply_set_effects

DAYS = 90
# Реальная сетка блочного тренажёра — нестандартная, не «+2,5 кг».
MACHINE_GRID = [36.2, 40.8, 45.3, 49.8, 54.4, 58.9, 63.5, 68.0, 72.6]
DUMBBELL_GRID = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24]
BARBELL_GRID = [40, 42.5, 45, 47.5, 50, 52.5, 55, 57.5, 60, 62.5, 65, 67.5, 70]


class Command(BaseCommand):
    help = "Создаёт демо-пользователя @demo с 90 днями данных."

    def add_arguments(self, parser):
        parser.add_argument("--username", default="demo_user")
        parser.add_argument("--password", default="demo12345")
        parser.add_argument("--reset", action="store_true", help="Удалить и создать заново.")

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(20260918)
        username = options["username"]
        if options["reset"]:
            User.objects.filter(username=username).delete()
        if User.objects.filter(username=username).exists():
            self.stdout.write(self.style.WARNING(
                f"@{username} уже существует. Запустите с --reset, чтобы пересоздать."
            ))
            return

        self.today = timezone.localdate()
        self.start = self.today - timedelta(days=DAYS)

        user = self._account(username, options["password"])
        gyms = self._gyms(user)
        template = self._program(user, gyms["work"])
        self._weight(user)
        self._sleep(user)
        self._nutrition(user)
        self._habits(user)
        self._injuries(user, gyms["work"])
        self._workouts(user, template, gyms)
        self._journal(user)
        self._goals(user)

        self.stdout.write(self.style.SUCCESS(
            f"Готово. Вход: @{username} / {options['password']}\n"
            f"  тренировок: {WorkoutSession.objects.filter(user=user).count()}\n"
            f"  подходов: {SetLog.objects.filter(user=user).count()}\n"
            f"  взвешиваний: {WeightEntry.objects.filter(user=user).count()}\n"
            f"  ночей сна: {SleepEntry.objects.filter(user=user).count()}"
        ))

    # ------------------------------------------------------------------
    def _dt(self, day: date, hour: int, minute: int = 0):
        return timezone.make_aware(datetime.combine(day, time(hour, minute)))

    def _account(self, username, password):
        user = User.objects.create_user(
            username=username, email=f"{username}@tworld.local",
            password=password, display_name="Демо Пользователь",
        )
        Profile.objects.create(
            user=user, sex=Profile.Sex.MALE, birth_date=date(1995, 4, 12),
            height_cm=Decimal("182.0"), start_weight_kg=Decimal("86.40"),
            goal_weight_kg=Decimal("78.00"), goal_bodyfat_pct=Decimal("14.0"),
            goal_deadline=self.today + timedelta(days=120),
        )
        UserSettings.objects.create(
            user=user, protein_target_g=160, water_target_ml=2500,
            bedtime_goal=time(23, 30), wake_goal=time(7, 0),
            commute_home_minutes=60, wind_down_minutes=60, free_meal_weekday=5,
            onboarding_completed_at=timezone.now(),
        )
        NotificationSettings.objects.create(user=user)
        return user

    def _gyms(self, user):
        work = Gym.objects.create(user=user, name="Зал у работы",
                                  kind=Gym.Kind.WORK, is_default=True)
        home = Gym.objects.create(user=user, name="Дома", kind=Gym.Kind.HOME)
        travel = Gym.objects.create(user=user, name="В поездке", kind=Gym.Kind.TRAVEL)
        user.settings.default_gym = work
        user.settings.save(update_fields=["default_gym"])

        # Один и тот же тренажёр в разных залах даёт разные цифры.
        grids = {
            "Жим в тренажёре на грудь": (MACHINE_GRID, "№4", "сиденье 3, спинка 5"),
            "Тяга верхнего блока": (MACHINE_GRID, "№7", "валики на 6"),
            "Тяга горизонтального блока": (MACHINE_GRID, "№8", ""),
            "Скручивания на блоке": (MACHINE_GRID, "№11", "канат, колени на коврик"),
            "Жим гантелей лёжа": (DUMBBELL_GRID, "", "скамья горизонтально"),
            "Молотки с гантелями": (DUMBBELL_GRID, "", ""),
            "Жим штанги лёжа": (BARBELL_GRID, "", "стойка 8"),
            "Жим ногами": ([60, 80, 100, 120, 140, 160, 180, 200], "№2", "спинка 4"),
        }
        for name, (grid, number, seat) in grids.items():
            exercise = Exercise.objects.filter(owner=None, name=name).first()
            if exercise is None:
                continue
            GymExerciseProfile.objects.create(
                user=user, gym=work, exercise=exercise, weight_steps=grid,
                machine_number=number, seat_settings=seat,
            )
            # В домашнем зале другая сетка гантелей — намеренно.
            if grid is DUMBBELL_GRID:
                GymExerciseProfile.objects.create(
                    user=user, gym=home, exercise=exercise,
                    weight_steps=[8, 12, 16, 20], notes="Дома только четыре пары.",
                )
        return {"work": work, "home": home, "travel": travel}

    def _program(self, user, gym):
        template = WorkoutTemplate.objects.create(
            user=user, name="Верх тела", duration_limit_minutes=75,
            description="Основная программа. Обязательный блок — три упражнения.",
        )
        blocks = {
            "required": TemplateBlock.objects.create(
                template=template, name="Обязательный", priority="required", order=0),
            "main": TemplateBlock.objects.create(
                template=template, name="Основной", priority="main", order=1),
            "optional": TemplateBlock.objects.create(
                template=template, name="По остатку сил", priority="optional", order=2),
        }
        plan = [
            ("required", "Жим в тренажёре на грудь", 4, 8, 12, 63.5),
            ("required", "Тяга верхнего блока", 4, 8, 12, 54.4),
            ("required", "Жим гантелей лёжа", 3, 8, 12, 16),
            ("main", "Молотки с гантелями", 3, 10, 14, 14),
            ("main", "Тяга горизонтального блока", 3, 10, 12, 49.8),
            ("main", "Махи гантелями в стороны", 3, 12, 15, 8),
            # Это упражнение стоит последним — и потому пропускается.
            ("optional", "Скручивания на блоке", 3, 12, 15, 45.3),
            ("optional", "Планка", 3, None, None, None),
        ]
        for order, (block, name, sets, reps_min, reps_max, weight) in enumerate(plan):
            exercise = Exercise.objects.filter(owner=None, name=name).first()
            if exercise is None:
                continue
            TemplateExercise.objects.create(
                block=blocks[block], exercise=exercise, order=order,
                target_sets=sets, target_reps_min=reps_min, target_reps_max=reps_max,
                target_weight_kg=weight,
                target_seconds=60 if exercise.load_type == "time" else None,
            )
        for weekday in (0, 2, 4):
            TemplateSchedule.objects.create(template=template, weekday=weekday)

        legs = WorkoutTemplate.objects.create(
            user=user, name="Ноги", duration_limit_minutes=60)
        legs_block = TemplateBlock.objects.create(
            template=legs, name="Обязательный", priority="required", order=0)
        for order, (name, sets, weight) in enumerate(
            [("Жим ногами", 4, 140), ("Сгибания ног лёжа", 3, 40), ("Подъёмы на носки", 3, 60)]
        ):
            exercise = Exercise.objects.filter(owner=None, name=name).first()
            if exercise:
                TemplateExercise.objects.create(
                    block=legs_block, exercise=exercise, order=order,
                    target_sets=sets, target_reps_min=10, target_reps_max=14,
                    target_weight_kg=weight,
                )
        TemplateSchedule.objects.create(template=legs, weekday=6)
        return template

    # ------------------------------------------------------------------
    def _weight(self, user):
        """Плавное снижение + неделя «набора», который на деле вода."""
        weight = 86.4
        for offset in range(DAYS + 1):
            day = self.start + timedelta(days=offset)
            if offset % 7 == 3 and random.random() < 0.3:
                continue  # пропущенные взвешивания — это нормально
            weight -= random.uniform(0.02, 0.09)
            noise = random.uniform(-0.55, 0.55)
            # На 60-й день — «+1,7 кг за неделю», хотя это соль и углеводы.
            if 58 <= offset <= 64:
                noise += 1.4
            WeightEntry.objects.create(
                user=user, at=self._dt(day, 8, random.randint(0, 40)),
                weight_kg=Decimal(f"{weight + noise:.2f}"),
                conditions={"morning": True, "fasted": True,
                            "after_toilet": True, "undressed": offset % 3 == 0},
            )
        # Один вечерний замер — чтобы было видно предупреждение о несравнимости.
        WeightEntry.objects.create(
            user=user, at=self._dt(self.today - timedelta(days=5), 22, 10),
            weight_kg=Decimal(f"{weight + 1.9:.2f}"),
            conditions={"morning": False, "fasted": False,
                        "after_toilet": False, "undressed": False},
            note="Вечером после ужина — для сравнения не годится.",
        )
        rebuild_trend(user)

        for offset in (0, 30, 60, 88):
            day = self.start + timedelta(days=offset)
            waist = 94 - offset * 0.05
            for site, value in [
                ("waist", waist), ("chest", 104), ("hips", 99),
                ("arm_l", 35.5), ("arm_r", 36.0), ("neck", 39.5),
            ]:
                BodyMeasurement.objects.create(
                    user=user, date=day, site=site,
                    value_cm=Decimal(f"{value + random.uniform(-0.3, 0.3):.1f}"),
                )

        for offset, (fat_pct, muscle) in zip((5, 45, 85), [(24.1, 36.2), (22.0, 36.9), (20.4, 37.1)]):
            day = self.start + timedelta(days=offset)
            scan = BodyCompositionScan.objects.create(
                user=user, at=self._dt(day, 10), device="InBody 770",
                weight_kg=Decimal(f"{86.4 - offset * 0.07:.2f}"),
                body_fat_pct=Decimal(str(fat_pct)),
                body_fat_kg=Decimal(f"{(86.4 - offset * 0.07) * fat_pct / 100:.2f}"),
                skeletal_muscle_kg=Decimal(str(muscle)),
                total_water_l=Decimal("46.8"), intracellular_water_l=Decimal("29.1"),
                extracellular_water_l=Decimal("17.7"), protein_kg=Decimal("12.6"),
                minerals_kg=Decimal("4.3"), visceral_fat_level=Decimal("9.0"),
                bmr_kcal=1810, score=78,
                conditions_note="Утро, до тренировки, натощак.",
            )
            for segment, lean, fat in [
                ("arm_l", 3.5, 1.1), ("arm_r", 3.6, 1.1), ("trunk", 29.4, 9.8),
                ("leg_l", 9.7, 3.2), ("leg_r", 9.8, 3.2),
            ]:
                BodyCompositionSegment.objects.create(
                    scan=scan, segment=segment,
                    lean_mass_kg=Decimal(str(lean)), fat_mass_kg=Decimal(str(fat)),
                )

    def _sleep(self, user):
        """Есть неделя недосыпа — чтобы сработало предупреждение и просел зал."""
        for offset in range(DAYS):
            night = self.start + timedelta(days=offset)
            if random.random() < 0.06:
                continue
            bad_week = 70 <= offset <= 76
            bed_hour, bed_minute = (1, random.randint(0, 50)) if bad_week else (
                23, random.randint(0, 59)
            )
            if bad_week:
                bed_dt = self._dt(night + timedelta(days=1), bed_hour, bed_minute)
                wake_dt = self._dt(night + timedelta(days=1), 6, random.randint(30, 59))
            else:
                bed_dt = self._dt(night, bed_hour, bed_minute)
                wake_dt = self._dt(night + timedelta(days=1), 7, random.randint(0, 40))
            SleepEntry.objects.create(
                user=user, night_of=night, bed_time=bed_dt, wake_time=wake_dt,
                quality_1_5=random.randint(2, 5) if not bad_week else random.randint(1, 3),
                source=SleepEntry.Source.SHORTCUT,
            )

    def _nutrition(self, user):
        foods = list(FoodItem.objects.filter(owner=None, is_quick_button=True))
        supplements = [
            Supplement.objects.create(user=user, name="Креатин", order=0),
            Supplement.objects.create(user=user, name="Витамин D", order=1),
            Supplement.objects.create(user=user, name="Омега-3", order=2),
        ]
        for offset in range(DAYS):
            day = self.start + timedelta(days=offset)
            for hour in (9, 14, 20):
                if random.random() < 0.15:
                    continue
                entry = MealEntry.objects.create(
                    user=user, at=self._dt(day, hour, random.randint(0, 50)),
                    meal_type={9: "breakfast", 14: "lunch", 20: "dinner"}[hour],
                    source=MealEntry.Source.QUICK,
                )
                for food in random.sample(foods, k=random.randint(1, 2)):
                    quantity = Decimal(str(random.choice([1, 1, 1.5, 2])))
                    MealEntryItem.objects.create(
                        meal_entry=entry, food_item=food, quantity=quantity,
                        protein_g=food.protein_g * quantity,
                    )
                entry.recalculate()
            for _ in range(random.randint(4, 9)):
                WaterLog.objects.create(
                    user=user, at=self._dt(day, random.randint(8, 22), random.randint(0, 59)),
                    volume_ml=250,
                )
            for supplement in supplements:
                if random.random() < 0.85:
                    SupplementLog.objects.create(
                        user=user, supplement=supplement, date=day, taken=True
                    )
            # Сладкие напитки считаются отдельно от еды — самая незаметная утечка.
            for kind, chance, sugar in [
                ("sweets", 0.28, 20), ("sugary_drink", 0.22, 25),
                ("fastfood", 0.08, None), ("alcohol", 0.07, None),
            ]:
                if random.random() < chance:
                    DietExceptionLog.objects.create(
                        user=user, at=self._dt(day, random.randint(13, 22)),
                        kind=kind,
                        estimated_sugar_g=Decimal(str(sugar)) if sugar else None,
                        amount_note="стакан сока" if kind == "sugary_drink" else "",
                    )

    def _habits(self, user):
        triggers = list(CravingTrigger.objects.all())
        sugar = Habit.objects.create(
            user=user, name="Без сладкого", kind=Habit.Kind.QUIT,
            decision_date=self.today - timedelta(days=340),
            timeline_kind="sugar", money_per_day=Decimal("120.00"), order=0,
        )
        smoking = Habit.objects.create(
            user=user, name="Без сигарет", kind=Habit.Kind.QUIT,
            decision_date=self.today - timedelta(days=512),
            timeline_kind="smoking", money_per_day=Decimal("250.00"), order=1,
        )
        walk = Habit.objects.create(
            user=user, name="Прогулка 30 минут", kind=Habit.Kind.BUILD,
            decision_date=self.today - timedelta(days=60), target_per_week=5, order=2,
        )
        # Срывы: история не стирается, серия начинается рядом.
        for days_ago in (240, 130, 47, 12):
            HabitEpisode.objects.create(
                user=user, habit=sugar,
                occurred_at=self._dt(self.today - timedelta(days=days_ago), 21, 30),
                trigger=random.choice(triggers),
                note="Вечером дома, после тяжёлого дня.",
            )
        HabitEpisode.objects.create(
            user=user, habit=smoking,
            occurred_at=self._dt(self.today - timedelta(days=320), 23, 0),
            note="В компании.",
        )
        for text in ["Стакан воды", "Выйти на улицу на 5 минут", "Позвонить брату",
                     "Жвачка без сахара", "10 отжиманий"]:
            Replacement.objects.create(user=user, habit=sugar, text=text,
                                       order=len(text) % 5)
        # Тяга концентрируется в будни вечером — отсюда персональное напоминание.
        for offset in range(DAYS):
            day = self.start + timedelta(days=offset)
            if day.weekday() < 5 and random.random() < 0.35:
                CravingLog.objects.create(
                    user=user, habit=sugar,
                    occurred_at=self._dt(day, random.choice([21, 21, 22, 22, 23])),
                    intensity_1_10=random.randint(3, 9),
                    trigger=random.choice(triggers),
                    place=random.choice(["дома", "дома", "в машине", "на работе"]),
                    what_helped=random.choice(["стакан воды", "прогулка", "", "чай"]),
                    resisted=random.random() > 0.15,
                )
            if random.random() < 0.6:
                from apps.habits.models import HabitCheckin

                HabitCheckin.objects.create(user=user, habit=walk, date=day, done=True)

        challenge = Challenge.objects.create(
            user=user, title="29 прогулок по 4 км за лето",
            target_value=Decimal("29"), unit="count",
            started_on=self.today - timedelta(days=70),
            deadline=self.today + timedelta(days=20),
            auto_rule={"source": "health", "metric": "distance_m",
                       "min_value": 4000, "single_activity": True},
        )
        for index in range(17):
            ChallengeEntry.objects.create(
                user=user, challenge=challenge,
                date=self.today - timedelta(days=70 - index * 4),
                value=Decimal("1"), source="health",
                external_id=f"demo-walk-{index}",
            )

    def _injuries(self, user, gym):
        """Травма плеча с рецидивом внутри 60 дней + личный лимит веса."""
        shoulder = BodyPart.objects.get(code="shoulder_l")
        first = Injury.objects.create(
            user=user, body_part=shoulder, side=Injury.Side.LEFT,
            character=Injury.Character.SHARP,
            started_on=self.today - timedelta(days=54),
            resolved_on=self.today - timedelta(days=40),
            initial_severity=6,
            notes="Заболело левое плечо после разведений — резко добавил вес.",
        )
        auto_flag_exercises(first)
        for index in range(6):
            InjuryLog.objects.create(
                injury=first, date=self.today - timedelta(days=54 - index * 2),
                severity_1_10=max(1, 6 - index),
            )
        second = Injury.objects.create(
            user=user, body_part=shoulder, side=Injury.Side.LEFT,
            character=Injury.Character.ACHE,
            started_on=self.today - timedelta(days=9),
            initial_severity=4,
            notes="Снова то же плечо, после жима гантелей сидя.",
        )
        auto_flag_exercises(second)
        check_recurrence(second)
        for index in range(4):
            InjuryLog.objects.create(
                injury=second, date=self.today - timedelta(days=9 - index * 2),
                severity_1_10=max(2, 4 - index // 2),
            )

        crunches = Exercise.objects.filter(owner=None, name="Скручивания на блоке").first()
        if crunches:
            WeightLimit.objects.create(
                user=user, exercise=crunches, max_weight_kg=Decimal("63.50"),
                reason="Спина — на большем весе прострелило поясницу.",
            )
        press = Exercise.objects.filter(owner=None, name="Жим гантелей сидя").first()
        if press:
            WeightLimit.objects.create(
                user=user, exercise=press, max_weight_kg=Decimal("18.00"),
                reason="Левое плечо — выше этого начинает ныть.",
            )

    # ------------------------------------------------------------------
    def _workouts(self, user, template, gyms):
        reasons = {reason.code: reason for reason in FailReason.objects.all()}
        legs_template = WorkoutTemplate.objects.get(user=user, name="Ноги")
        skip_streak_left = 6  # «Скручивания» пропускаются шесть раз подряд

        for offset in range(DAYS):
            day = self.start + timedelta(days=offset)
            weekday = day.weekday()
            if weekday not in (0, 2, 4, 6):
                continue
            if random.random() < 0.12:
                continue  # пропуск тренировки — это данные, а не провал

            active = legs_template if weekday == 6 else template
            gym = gyms["travel"] if 30 <= offset <= 34 else gyms["work"]
            bad_sleep = 70 <= offset <= 76
            session = WorkoutSession.objects.create(
                user=user, template=active, gym=gym, date=day,
                started_at=self._dt(day, 18, random.randint(0, 30)),
                status=WorkoutSession.Status.COMPLETED,
                wellbeing_1_10=self._wellbeing(user, day),
                is_training_while_injured=offset >= DAYS - 9 and random.random() < 0.5,
                notes="Сил не было совсем." if bad_sleep else "",
            )
            order = 0
            for block in active.blocks.all().order_by("order"):
                for item in block.exercises.all().order_by("order"):
                    exercise = item.exercise
                    entry = SessionExercise.objects.create(
                        user=user, session=session, exercise=exercise,
                        template_exercise=item, block_priority=block.priority, order=order,
                    )
                    order += 1

                    # Упражнение в конце списка пропускается раз за разом.
                    if (
                        exercise.name == "Скручивания на блоке"
                        and skip_streak_left > 0
                        and offset > DAYS - 30
                    ):
                        skip_streak_left -= 1
                        entry.status = SessionExercise.Status.FAILED
                        entry.fail_reason = reasons["no_time"]
                        entry.save()
                        continue
                    if block.priority == "optional" and random.random() < 0.4:
                        entry.status = SessionExercise.Status.SKIPPED
                        entry.save()
                        continue
                    if random.random() < 0.06:
                        entry.status = SessionExercise.Status.FAILED
                        entry.fail_reason = reasons[random.choice(
                            ["machine_busy", "no_energy", "pain"]
                        )]
                        entry.save()
                        continue

                    entry.status = SessionExercise.Status.DONE
                    entry.save()
                    self._sets(user, entry, item, offset, bad_sleep)

            session.ended_at = session.started_at + timedelta(
                minutes=random.randint(52, 78)
            )
            session.save()
            session.recalculate()

    def _wellbeing(self, user, day) -> int:
        """Самочувствие следует за сном накануне.

        Связь заложена в демо-данные намеренно: именно её показывает
        график «сон → самочувствие в зале», и без неё на нём нечего смотреть.
        """
        night = SleepEntry.objects.filter(
            user=user, night_of=day - timedelta(days=1)
        ).first()
        if night is None or night.duration_minutes is None:
            return random.randint(5, 8)
        hours = night.duration_minutes / 60
        base = 2 + (hours - 4) * 1.5          # 4 ч → 2/10, 8 ч → 8/10
        return max(1, min(10, round(base + random.uniform(-0.8, 0.8))))

    def _sets(self, user, entry, item, offset, bad_sleep):
        exercise = entry.exercise
        if exercise.load_type == "time":
            # Планка: каждая попытка — отдельная запись, всегда целые секунды.
            base = 55 + offset // 6
            for number in range(1, 4):
                SetLog.objects.create(
                    user=user, session_exercise=entry, set_number=number,
                    duration_seconds=max(20, base - (number - 1) * 8 + random.randint(-5, 5)),
                    completed_at=entry.session.started_at + timedelta(minutes=number * 3),
                )
            return

        weight = self._weight_for(exercise.name, item, offset)
        target_max = item.target_reps_max or 12
        target_min = item.target_reps_min or 8

        SetLog.objects.create(  # разминка не идёт в рабочий тоннаж
            user=user, session_exercise=entry, set_number=1, is_warmup=True,
            weight_kg=Decimal(f"{weight * 0.6:.2f}"), reps=12,
            weight_is_per_side=exercise.is_unilateral,
            completed_at=entry.session.started_at,
        )
        for number in range(2, (item.target_sets or 3) + 2):
            reps = random.randint(target_min, target_max)
            if bad_sleep:
                reps = max(target_min - 2, reps - 3)
            SetLog.objects.create(
                user=user, session_exercise=entry, set_number=number,
                weight_kg=Decimal(f"{weight:.2f}"), reps=reps,
                weight_is_per_side=exercise.is_unilateral,
                rir=random.randint(0, 3),
                completed_at=entry.session.started_at + timedelta(minutes=number * 4),
            )
        for set_log in entry.sets.all():
            apply_set_effects(set_log)

    def _weight_for(self, name, item, offset) -> float:
        base = float(item.target_weight_kg or 20)
        # Резкий скачок: гантели 8 → 16 за неделю — и травма плеча следом.
        # Ту же ошибку пользователь повторяет сейчас (16 → 20), чтобы
        # предупреждение о скачке было видно на экране прямо сегодня.
        if name == "Жим гантелей лёжа":
            if offset < DAYS - 62:
                return 8
            if offset < DAYS - 55:
                return 16
            if offset < DAYS - 5:
                return 18
            return 22
        # Трёхнедельный застой в конце периода.
        if name == "Тяга верхнего блока":
            if offset > DAYS - 21:
                return 54.4
            return MACHINE_GRID[min(len(MACHINE_GRID) - 1, 2 + offset // 25)]
        if name == "Жим в тренажёре на грудь":
            return MACHINE_GRID[min(len(MACHINE_GRID) - 1, 3 + offset // 30)]
        return base

    def _journal(self, user):
        LifeEvent.objects.create(
            user=user, date_from=self.start + timedelta(days=30),
            date_to=self.start + timedelta(days=35),
            kind=LifeEvent.Kind.TRIP, title="Командировка",
        )
        LifeEvent.objects.create(
            user=user, date_from=self.today - timedelta(days=54),
            kind=LifeEvent.Kind.INJURY, title="Плечо",
        )
        LifeEvent.objects.create(
            user=user, date_from=self.today - timedelta(days=76),
            date_to=self.today - timedelta(days=70),
            kind=LifeEvent.Kind.EXAM, title="Сдача проекта",
        )
        texts = [
            "Тренировка зашла легко, вес взял с запасом.",
            "Сил не было совсем, но обязательный блок закрыл.",
            "Заболело левое плечо после разведений.",
            "Лёг в час ночи — утром всё как в тумане.",
            "Съел торт на работе. Не драма, просто отмечаю.",
            "Талия -1 см за месяц, а весы стоят. Значит, работает.",
        ]
        for offset in range(0, DAYS, 6):
            day = self.start + timedelta(days=offset)
            JournalEntry.objects.create(
                user=user, date=day, at=self._dt(day, 22),
                text=random.choice(texts),
            )
        for offset in range(DAYS):
            day = self.start + timedelta(days=offset)
            if random.random() < 0.7:
                bad = 70 <= offset <= 76
                DailyLog.objects.create(
                    user=user, date=day,
                    mood_1_5=random.randint(1, 3) if bad else random.randint(3, 5),
                    energy_1_5=random.randint(1, 2) if bad else random.randint(3, 5),
                )

    def _goals(self, user):
        plank = Exercise.objects.filter(owner=None, name="Планка").first()
        pullups = Exercise.objects.filter(owner=None, name="Подтягивания").first()
        Standard.objects.create(
            user=user, name="Планка 2 минуты",
            source=Standard.Source.EXERCISE_MAX_DURATION, exercise=plank,
            target_value=Decimal("120"), unit="сек",
            deadline=self.today + timedelta(days=60),
        )
        Standard.objects.create(
            user=user, name="15 подтягиваний",
            source=Standard.Source.EXERCISE_MAX_REPS, exercise=pullups,
            target_value=Decimal("15"), unit="повт.",
        )
        Standard.objects.create(
            user=user, name="5 км за 25 минут", source=Standard.Source.MANUAL,
            target_value=Decimal("25"), unit="мин",
        )
