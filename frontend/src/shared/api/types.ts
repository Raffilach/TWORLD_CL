/** Типы ответов API. Длительности — всегда целые секунды. */

export type LoadType = "weight_reps" | "time" | "bodyweight_reps" | "distance";
export type BlockPriority = "required" | "main" | "optional";
export type ExerciseStatus = "pending" | "done" | "skipped" | "failed";

export interface User {
  id: string;
  username: string;
  handle: string;
  email: string | null;
  phone: string | null;
  display_name: string;
  initials: string;
  date_joined: string;
  profile: Profile | null;
}

export interface Profile {
  sex: string;
  birth_date: string | null;
  height_cm: string | null;
  start_weight_kg: string | null;
  timezone: string;
  unit_system: "metric" | "imperial";
  language: "ru" | "en";
  avatar: string | null;
  goal_weight_kg: string | null;
  goal_bodyfat_pct: string | null;
  goal_deadline: string | null;
}

export interface TodayBlock {
  block_id: string;
  visible: boolean;
  order?: number;
}

export interface UserSettings {
  today_blocks: TodayBlock[];
  protein_target_g: number;
  track_calories: boolean;
  calorie_target: number | null;
  water_target_ml: number;
  water_glass_ml: number;
  free_meal_weekday: number | null;
  bedtime_goal: string;
  wake_goal: string;
  sleep_target_minutes: number;
  commute_home_minutes: number;
  wind_down_minutes: number;
  default_gym: number | null;
  rest_default_seconds: number;
  rest_presets: { label: string; seconds: number }[];
  ask_rir: boolean;
  count_bodyweight_in_tonnage: boolean;
  diary_lock_enabled: boolean;
  diary_biometric: boolean;
  week_starts_on: number;
  theme: "auto" | "light" | "dark";
  leave_gym_by: string;
}

export interface Exercise {
  id: number;
  name: string;
  load_type: LoadType;
  equipment: number | null;
  equipment_name?: string;
  is_unilateral: boolean;
  bodyweight_factor: string | null;
  default_rest_seconds: number;
  movement_tags: number[];
  instructions: string;
  is_archived: boolean;
  is_global: boolean;
  muscle_links: { muscle: number; muscle_name: string; muscle_group: string; role: string }[];
  alternatives: { id: number; alternative: number; alternative_name: string; order: number }[];
}

export interface Gym {
  id: number;
  name: string;
  kind: "work" | "home" | "travel" | "other";
  is_default: boolean;
  notes: string;
}

export interface GymExerciseProfile {
  id: number;
  gym: number;
  gym_name?: string;
  exercise: number;
  exercise_name?: string;
  weight_steps: number[];
  step_kg: string | null;
  last_weight_kg: string | null;
  last_reps: number | null;
  machine_number: string;
  seat_settings: string;
  grip: string;
  notes: string;
  photo: string | null;
}

export interface SetLog {
  id: number;
  client_id: string;
  session_exercise: number;
  set_number: number;
  is_warmup: boolean;
  weight_kg: string | null;
  weight_is_per_side: boolean;
  reps: number | null;
  /** Всегда целые секунды. Формата «часы:минуты» здесь не существует. */
  duration_seconds: number | null;
  duration_label: string | null;
  distance_m: number | null;
  rir: number | null;
  completed_at: string | null;
  notes: string;
  tonnage: string;
  warnings?: LimitWarning[];
}

export interface LimitWarning {
  type: string;
  limit_kg: string;
  entered_kg: string;
  reason: string;
  message: string;
  blocking: boolean;
}

export interface SessionExercise {
  id: number;
  session: number;
  exercise: number;
  exercise_name: string;
  load_type: LoadType;
  is_unilateral: boolean;
  template_exercise: number | null;
  block_priority: BlockPriority;
  order: number;
  status: ExerciseStatus;
  fail_reason: number | null;
  fail_reason_code?: string;
  fail_reason_note: string;
  notes: string;
  sets: SetLog[];
  counts_against_discipline: boolean;
  alternatives?: { id: number; alternative: number; alternative_name: string }[];
}

export interface WorkoutSession {
  id: number;
  gym: number | null;
  gym_name?: string;
  template: number | null;
  template_name?: string;
  date: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  status: "planned" | "in_progress" | "completed" | "abandoned";
  wellbeing_1_10: number | null;
  notes: string;
  is_training_while_injured: boolean;
  tonnage_kg: string;
  working_sets_count: number;
  exercises: SessionExercise[];
  completion: {
    required_done: boolean;
    blocks: Record<string, { done: number; total: number }>;
    priority_labels: Record<string, string>;
  };
}

export interface TemplateExercise {
  id: number;
  block: number;
  exercise: number;
  exercise_name: string;
  load_type: LoadType;
  order: number;
  target_sets: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_seconds: number | null;
  target_weight_kg: string | null;
  rest_seconds: number | null;
  notes: string;
}

export interface TemplateBlock {
  id: number;
  template: number;
  name: string;
  priority: BlockPriority;
  priority_label: string;
  order: number;
  exercises: TemplateExercise[];
}

export interface WorkoutTemplate {
  id: number;
  name: string;
  description: string;
  duration_limit_minutes: number | null;
  is_active: boolean;
  blocks: TemplateBlock[];
  schedules: { id: number; weekday: number; is_auto_repeating: boolean }[];
  estimated_minutes: number;
  over_limit: boolean;
}

export interface HabitStats {
  /** Никогда не обнуляется — в этом весь смысл. */
  days_since_decision: number;
  current_streak: number;
  total_clean_days: number;
  episodes_count: number;
  money_saved: string | null;
}

export interface Habit {
  id: number;
  name: string;
  kind: "quit" | "build";
  decision_date: string;
  timeline_kind: string;
  target_per_week: number | null;
  money_per_day: string | null;
  order: number;
  is_active: boolean;
  stats: HabitStats;
}

export interface TodayPayload {
  date: string;
  layout: TodayBlock[];
  weight: {
    date?: string;
    trend_kg: string | null;
    raw_kg: string | null;
    raw_at?: string | null;
    change_7d: string | null;
    change_30d: string | null;
    placeholder_kg: string | null;
    conditions_default: Record<string, boolean>;
  };
  workout: {
    session: WorkoutSession | null;
    planned_template: WorkoutTemplate | null;
    next_planned: { date: string; template: WorkoutTemplate } | null;
  };
  nutrition: {
    protein_done_g: number;
    protein_target_g: number;
    water_done_ml: number;
    water_target_ml: number;
    water_glass_ml: number;
    supplements: { id: number; name: string; taken: boolean }[];
  };
  sleep: {
    last_night: {
      duration_minutes: number | null;
      bed_time: string | null;
      wake_time: string | null;
      source: string | null;
    };
    prefill: { bed_time: string | null; wake_time: string | null };
    warning: { message: string; average_minutes: number } | null;
  };
  habits: (HabitStats & { id: number; name: string; kind: string })[];
  mood_energy: { mood_1_5: number | null; energy_1_5: number | null };
  evening_plan: {
    bedtime_goal?: string;
    leave_gym_by?: string;
    explanation?: string;
    commute_home_minutes?: number;
    wind_down_minutes?: number;
  };
  safety_notices: { id: number; body_part: string; days_between: number }[];
  day_progress: { done: number; total: number; tone: string };
}
