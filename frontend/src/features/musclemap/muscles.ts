/**
 * Справочник мышц и мышечных групп — перенесён из мышечной карты
 * (ветка main, js/data.js): 44 мышцы в 16 группах, у каждой — русское
 * и латинское название и функция.
 *
 * Роли мышцы в упражнении и их вклад в «эффективные подходы»:
 *   p — основная мышца      × 1
 *   s — вспомогательная     × 0,5
 *   t — стабилизатор        × 0,25
 */

export type Role = "p" | "s" | "t";

export const ROLE_WEIGHT: Record<Role, number> = { p: 1, s: 0.5, t: 0.25 };
export const ROLE_NAME: Record<Role, string> = { p: "основная", s: "вспомогательная", t: "стабилизатор" };

export type GroupId =
  | "neck"
  | "traps"
  | "shoulders"
  | "rotator"
  | "chest"
  | "back"
  | "lowerback"
  | "biceps"
  | "triceps"
  | "forearms"
  | "core"
  | "glutes"
  | "hips"
  | "quads"
  | "hamstrings"
  | "calves";

export interface MuscleInfo {
  name: string;
  latin: string;
  group: GroupId;
  fn: string;
}

export const GROUPS: { id: GroupId; name: string }[] = [
  { id: "neck", name: "Шея" },
  { id: "traps", name: "Трапециевидная" },
  { id: "shoulders", name: "Дельтовидные" },
  { id: "rotator", name: "Вращательная манжета" },
  { id: "chest", name: "Грудные" },
  { id: "back", name: "Широчайшие и середина спины" },
  { id: "lowerback", name: "Поясница" },
  { id: "biceps", name: "Сгибатели плеча" },
  { id: "triceps", name: "Трицепс" },
  { id: "forearms", name: "Предплечья" },
  { id: "core", name: "Пресс и кор" },
  { id: "glutes", name: "Ягодичные" },
  { id: "hips", name: "Сгибатели и приводящие бедра" },
  { id: "quads", name: "Квадрицепс" },
  { id: "hamstrings", name: "Задняя поверхность бедра" },
  { id: "calves", name: "Голень" },
];

export const MUSCLES = {
  "sternocleidomastoid": { name: "Грудино-ключично-сосцевидная", latin: "m. sternocleidomastoideus", group: "neck",
    fn: "Сгибание и поворот головы, наклон шеи в сторону." },

  "trap-upper": { name: "Трапеция, верхняя часть", latin: "m. trapezius, pars descendens", group: "traps",
    fn: "Поднимание лопаток (шраги), разгибание и наклон шеи." },
  "trap-middle": { name: "Трапеция, средняя часть", latin: "m. trapezius, pars transversa", group: "traps",
    fn: "Сведение лопаток (ретракция), стабилизация лопатки." },
  "trap-lower": { name: "Трапеция, нижняя часть", latin: "m. trapezius, pars ascendens", group: "traps",
    fn: "Опускание лопаток, вращение лопатки вверх при подъёме рук." },

  "delt-front": { name: "Передняя дельта", latin: "m. deltoideus, pars clavicularis", group: "shoulders",
    fn: "Сгибание плеча (подъём руки вперёд), внутренняя ротация, горизонтальное приведение." },
  "delt-side": { name: "Средняя дельта", latin: "m. deltoideus, pars acromialis", group: "shoulders",
    fn: "Отведение плеча (подъём руки в сторону)." },
  "delt-rear": { name: "Задняя дельта", latin: "m. deltoideus, pars spinalis", group: "shoulders",
    fn: "Разгибание плеча, горизонтальное отведение, наружная ротация." },

  "infraspinatus": { name: "Подостная", latin: "m. infraspinatus", group: "rotator",
    fn: "Наружная ротация плеча, стабилизация головки плечевой кости." },
  "teres-minor": { name: "Малая круглая", latin: "m. teres minor", group: "rotator",
    fn: "Наружная ротация и приведение плеча, стабилизация сустава." },

  "pec-upper": { name: "Большая грудная, ключичная часть", latin: "m. pectoralis major, pars clavicularis", group: "chest",
    fn: "Сгибание плеча и горизонтальное приведение под углом вверх (жим на наклонной)." },
  "pec-mid": { name: "Большая грудная, грудинная часть", latin: "m. pectoralis major, pars sternocostalis", group: "chest",
    fn: "Горизонтальное приведение плеча, внутренняя ротация." },
  "pec-lower": { name: "Большая грудная, брюшная часть", latin: "m. pectoralis major, pars abdominalis", group: "chest",
    fn: "Приведение и разгибание плеча сверху вниз (отжимания на брусьях, жим с отрицательным наклоном)." },

  "lats": { name: "Широчайшая мышца спины", latin: "m. latissimus dorsi", group: "back",
    fn: "Приведение и разгибание плеча, внутренняя ротация (подтягивания, тяги)." },
  "teres-major": { name: "Большая круглая", latin: "m. teres major", group: "back",
    fn: "Приведение, разгибание и внутренняя ротация плеча — «помощник» широчайшей." },
  "rhomboids": { name: "Ромбовидные", latin: "mm. rhomboidei major et minor", group: "back",
    fn: "Сведение и поднимание лопаток, прижимание лопатки к грудной клетке." },

  "erectors": { name: "Разгибатели позвоночника", latin: "m. erector spinae", group: "lowerback",
    fn: "Разгибание и стабилизация позвоночника, удержание нейтральной спины." },

  "biceps": { name: "Двуглавая мышца плеча (бицепс)", latin: "m. biceps brachii", group: "biceps",
    fn: "Сгибание локтя, супинация предплечья, сгибание плеча." },
  "brachialis": { name: "Плечевая", latin: "m. brachialis", group: "biceps",
    fn: "Сгибание локтя в любом положении кисти — главный сгибатель локтя." },

  "triceps-long": { name: "Трицепс, длинная головка", latin: "m. triceps brachii, caput longum", group: "triceps",
    fn: "Разгибание локтя и разгибание плеча; максимально растянута при руке над головой." },
  "triceps-lateral": { name: "Трицепс, латеральная головка", latin: "m. triceps brachii, caput laterale", group: "triceps",
    fn: "Мощное разгибание локтя (жимы, разгибания на блоке)." },
  "triceps-medial": { name: "Трицепс, медиальная головка", latin: "m. triceps brachii, caput mediale", group: "triceps",
    fn: "Разгибание локтя во всех положениях, особенно в конечной фазе." },

  "brachioradialis": { name: "Плечелучевая", latin: "m. brachioradialis", group: "forearms",
    fn: "Сгибание локтя в нейтральном хвате (молотки, обратные сгибания)." },
  "forearm-flexors": { name: "Сгибатели запястья и пальцев", latin: "mm. flexores carpi et digitorum", group: "forearms",
    fn: "Сгибание кисти и пальцев, сила хвата." },
  "forearm-extensors": { name: "Разгибатели запястья и пальцев", latin: "mm. extensores carpi et digitorum", group: "forearms",
    fn: "Разгибание кисти и пальцев, стабилизация запястья." },

  "rectus-abdominis": { name: "Прямая мышца живота", latin: "m. rectus abdominis", group: "core",
    fn: "Сгибание туловища, подкручивание таза, стабилизация корпуса." },
  "obliques": { name: "Наружная косая мышца живота", latin: "m. obliquus externus abdominis", group: "core",
    fn: "Повороты и боковые наклоны туловища, антиротационная стабилизация." },
  "serratus": { name: "Передняя зубчатая", latin: "m. serratus anterior", group: "core",
    fn: "Протракция и вращение лопатки вверх, прижатие лопатки к рёбрам." },

  "glute-max": { name: "Большая ягодичная", latin: "m. gluteus maximus", group: "glutes",
    fn: "Разгибание и наружная ротация бедра (приседания, тяги, ягодичный мост)." },
  "glute-med": { name: "Средняя ягодичная", latin: "m. gluteus medius", group: "glutes",
    fn: "Отведение бедра, стабилизация таза при ходьбе и на одной ноге." },
  "tfl": { name: "Напрягатель широкой фасции", latin: "m. tensor fasciae latae", group: "glutes",
    fn: "Отведение, сгибание и внутренняя ротация бедра, натяжение подвздошно-большеберцового тракта." },

  "iliopsoas": { name: "Подвздошно-поясничная", latin: "m. iliopsoas", group: "hips",
    fn: "Главный сгибатель бедра (подъём коленей, подъёмы ног)." },
  "adductors": { name: "Приводящие мышцы бедра", latin: "mm. adductores longus et brevis, m. pectineus, m. gracilis", group: "hips",
    fn: "Приведение бедра, стабилизация таза." },
  "adductor-magnus": { name: "Большая приводящая", latin: "m. adductor magnus", group: "hips",
    fn: "Приведение и разгибание бедра — активно работает в глубоком приседе и тягах." },
  "sartorius": { name: "Портняжная", latin: "m. sartorius", group: "hips",
    fn: "Сгибание бедра и голени, наружная ротация бедра." },

  "rectus-femoris": { name: "Прямая мышца бедра", latin: "m. rectus femoris", group: "quads",
    fn: "Разгибание колена и сгибание бедра (двусуставная)." },
  "vastus-lateralis": { name: "Латеральная широкая", latin: "m. vastus lateralis", group: "quads",
    fn: "Разгибание колена; формирует внешний контур бедра." },
  "vastus-medialis": { name: "Медиальная широкая («капля»)", latin: "m. vastus medialis", group: "quads",
    fn: "Разгибание колена, стабилизация надколенника." },

  "biceps-femoris": { name: "Двуглавая мышца бедра", latin: "m. biceps femoris", group: "hamstrings",
    fn: "Сгибание колена, разгибание бедра, наружная ротация голени." },
  "semitendinosus": { name: "Полусухожильная", latin: "m. semitendinosus", group: "hamstrings",
    fn: "Сгибание колена, разгибание бедра, внутренняя ротация голени." },
  "semimembranosus": { name: "Полуперепончатая", latin: "m. semimembranosus", group: "hamstrings",
    fn: "Сгибание колена, разгибание бедра, стабилизация коленного сустава." },

  "gastrocnemius": { name: "Икроножная", latin: "m. gastrocnemius", group: "calves",
    fn: "Подошвенное сгибание стопы (подъём на носки) при прямом колене, сгибание колена." },
  "soleus": { name: "Камбаловидная", latin: "m. soleus", group: "calves",
    fn: "Подошвенное сгибание стопы, особенно при согнутом колене." },
  "tibialis": { name: "Передняя большеберцовая", latin: "m. tibialis anterior", group: "calves",
    fn: "Тыльное сгибание (подъём носка) и супинация стопы." },
  "peroneus": { name: "Малоберцовые", latin: "mm. fibulares (peronei)", group: "calves",
    fn: "Пронация (эверсия) и подошвенное сгибание стопы, стабилизация голеностопа." },
} satisfies Record<string, MuscleInfo>;

export type MuscleId = keyof typeof MUSCLES;
export const MUSCLE_IDS = Object.keys(MUSCLES) as MuscleId[];
