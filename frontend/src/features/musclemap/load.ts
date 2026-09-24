/**
 * Расчёт нагрузки на мышцы в «эффективных подходах».
 *
 * Рабочий подход упражнения даёт основной мышце 1, вспомогательной 0,5,
 * стабилизатору 0,25. Разминочные подходы не считаются.
 *
 * Роли берутся из библиотеки мышечной карты по названию упражнения.
 * Для своих упражнений пользователя, которых в библиотеке нет, —
 * из грубой разметки справочника («большая грудная — основная»):
 * такая мышца раскладывается на все свои части.
 */
import { LIBRARY } from "./library";
import type { LibraryExercise } from "./library";
import { MUSCLE_IDS, MUSCLES, ROLE_WEIGHT } from "./muscles";
import type { GroupId, MuscleId, Role } from "./muscles";

export type Roles = Partial<Record<MuscleId, Role>>;

const TRI: MuscleId[] = ["triceps-lateral", "triceps-medial"];
const QUADS: MuscleId[] = ["rectus-femoris", "vastus-lateralis", "vastus-medialis"];
const HAMS: MuscleId[] = ["biceps-femoris", "semitendinosus", "semimembranosus"];

/** Упражнения справочника приложения, которые в библиотеке названы иначе. */
const ALIASES: Record<string, string> = {
  "жим в тренажере на грудь": "db-press",
  "жим гантелей на наклонной": "incline-bench",
  "разведения гантелей лежа": "cable-fly",
  "сведения в кроссовере": "cable-fly",
  "отжимания на брусьях": "dips",
  "подтягивания": "pullups",
  "тяга гантели в наклоне": "db-row",
  "тяга в тренажере сидя": "cable-row",
  "пуловер на блоке": "pullover",
  "шраги с гантелями": "shrugs",
  "жим штанги стоя": "ohp",
  "махи в наклоне": "reverse-fly",
  "разведения в тренажере назад": "reverse-fly",
  "сгибания на бицепс на блоке": "barbell-curl",
  "французский жим": "skull-crusher",
  "разгибания на блоке": "pushdown",
  "разгибания ног в тренажере": "leg-extension",
  "сгибания ног лежа": "leg-curl",
  "подъемы на носки": "calf-raise",
  "скручивания на блоке": "crunch",
  "скручивания в тренажере": "crunch",
  "русский твист": "russian-twist",
};

/** Упражнения справочника, которых нет в библиотеке вовсе: вис и кардио. */
const EXTRA: Record<string, Omit<LibraryExercise, "id" | "name" | "cat">> = {
  "вис на перекладине": {
    p: ["forearm-flexors"],
    s: ["lats", "teres-major"],
    t: ["trap-lower", "rectus-abdominis", "brachioradialis"],
  },
  "бег": {
    p: [],
    s: ["gastrocnemius", "soleus", ...QUADS, "glute-max"],
    t: [...HAMS, "iliopsoas", "tibialis", "rectus-abdominis"],
  },
  "ходьба": {
    p: [],
    s: [],
    t: ["gastrocnemius", "soleus", ...QUADS, "glute-max", "glute-med", "tibialis"],
  },
  "велотренажер": {
    p: [],
    s: [...QUADS, "glute-max"],
    t: [...HAMS, "gastrocnemius", "soleus"],
  },
  "гребной тренажер": {
    p: [],
    s: ["lats", "rhomboids", "trap-middle", ...QUADS, "glute-max"],
    t: ["biceps", "delt-rear", "erectors", ...HAMS, "forearm-flexors"],
  },
};

/** Грубые мышцы справочника (коды и русские названия) → части на карте. */
const COARSE: Record<string, MuscleId[]> = {
  chest_pec: ["pec-upper", "pec-mid", "pec-lower"],
  chest_pec_minor: ["serratus"],
  back_lats: ["lats", "teres-major"],
  back_traps: ["trap-upper", "trap-middle", "trap-lower"],
  back_rhomboids: ["rhomboids"],
  back_erectors: ["erectors"],
  delts_front: ["delt-front"],
  delts_side: ["delt-side"],
  delts_rear: ["delt-rear"],
  biceps: ["biceps"],
  brachialis: ["brachialis"],
  triceps: [...TRI, "triceps-long"],
  forearms: ["forearm-flexors", "forearm-extensors", "brachioradialis"],
  quads: QUADS,
  hamstrings: HAMS,
  glutes: ["glute-max", "glute-med"],
  calves: ["gastrocnemius", "soleus"],
  abs: ["rectus-abdominis"],
  obliques: ["obliques"],
  neck: ["sternocleidomastoid"],
};

const COARSE_BY_NAME: Record<string, string> = {
  "большая грудная": "chest_pec",
  "малая грудная": "chest_pec_minor",
  "широчайшие": "back_lats",
  "трапеции": "back_traps",
  "ромбовидные": "back_rhomboids",
  "разгибатели спины": "back_erectors",
  "передняя дельта": "delts_front",
  "средняя дельта": "delts_side",
  "задняя дельта": "delts_rear",
  "бицепс": "biceps",
  "плечевая мышца": "brachialis",
  "трицепс": "triceps",
  "предплечья": "forearms",
  "квадрицепс": "quads",
  "бицепс бедра": "hamstrings",
  "ягодичные": "glutes",
  "икроножные": "calves",
  "прямая мышца живота": "abs",
  "косые живота": "obliques",
  "шея": "neck",
};

export function normalize(name: string): string {
  return name.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

const LIBRARY_BY_ID = new Map(LIBRARY.map((item) => [item.id, item]));
const LIBRARY_BY_NAME = new Map(LIBRARY.map((item) => [normalize(item.name), item]));

function toRoles(entry: Pick<LibraryExercise, "p" | "s" | "t">): Roles {
  const roles: Roles = {};
  // Сильная роль перекрывает слабую, если мышца указана дважды.
  for (const role of ["t", "s", "p"] as Role[]) for (const id of entry[role]) roles[id] = role;
  return roles;
}

export interface CoarseLink {
  /** Код мышцы справочника (`chest_pec`) или её русское название. */
  code?: string;
  name?: string;
  role: string;
}

/** Роли мышц в упражнении: по названию, иначе по грубой разметке. */
export function rolesFor(name: string, coarse: CoarseLink[] = []): Roles | null {
  const key = normalize(name);
  const library = LIBRARY_BY_NAME.get(key) ?? LIBRARY_BY_ID.get(ALIASES[key] ?? "");
  if (library) return toRoles(library);
  if (EXTRA[key]) return toRoles(EXTRA[key]);

  const roles: Roles = {};
  for (const link of coarse) {
    const code = link.code ?? COARSE_BY_NAME[normalize(link.name ?? "")];
    const role: Role = link.role === "primary" ? "p" : "s";
    for (const id of COARSE[code ?? ""] ?? []) {
      if (roles[id] !== "p") roles[id] = role;
    }
  }
  return Object.keys(roles).length ? roles : null;
}

// --- нагрузка ----------------------------------------------------------------

export interface Contribution {
  name: string;
  role: Role;
  sets: number;
  eff: number;
}

export interface MuscleLoad {
  eff: number;
  contribs: Contribution[];
}

export type LoadMap = Record<MuscleId, MuscleLoad>;

export interface VolumeRow {
  name: string;
  sets: number;
  coarse?: CoarseLink[];
}

export function computeLoad(rows: VolumeRow[]): { load: LoadMap; unknown: string[] } {
  const load = Object.fromEntries(
    MUSCLE_IDS.map((id) => [id, { eff: 0, contribs: [] as Contribution[] }]),
  ) as LoadMap;
  const unknown: string[] = [];
  for (const row of rows) {
    const roles = rolesFor(row.name, row.coarse);
    if (!roles) {
      unknown.push(row.name);
      continue;
    }
    for (const [id, role] of Object.entries(roles) as [MuscleId, Role][]) {
      const eff = row.sets * ROLE_WEIGHT[role];
      load[id].eff += eff;
      load[id].contribs.push({ name: row.name, role, sets: row.sets, eff });
    }
  }
  for (const id of MUSCLE_IDS) load[id].contribs.sort((a, b) => b.eff - a.eff);
  return { load, unknown };
}

// --- шкала ---------------------------------------------------------------------

export type Zone = 0 | 1 | 2 | 3;

/** Пороги в эффективных подходах: [начало средней зоны, начало высокой]. */
export const SCALES = {
  session: { name: "Тренировка", t1: 3, t2: 6 },
  week: { name: "Неделя", t1: 6, t2: 12 },
} as const;
export type ScaleId = keyof typeof SCALES;

export function zoneOf(value: number, scale: ScaleId): Zone {
  const { t1, t2 } = SCALES[scale];
  if (value <= 0) return 0;
  if (value < t1) return 1;
  if (value < t2) return 2;
  return 3;
}

export const ZONE_NAMES: Record<Zone, string> = {
  0: "Нет нагрузки",
  1: "Низкая",
  2: "Средняя",
  3: "Высокая",
};

/** «5,75» — дробные эффективные подходы по-русски. */
export function formatEff(value: number): string {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

/** Упражнения библиотеки, где мышца — основная: подсказка «чем добрать». */
export function exercisesFor(id: MuscleId): LibraryExercise[] {
  return LIBRARY.filter((item) => item.p.includes(id));
}

export function groupOf(id: MuscleId): GroupId {
  return MUSCLES[id].group;
}
