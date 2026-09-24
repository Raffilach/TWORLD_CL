import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useAuth } from "../../app/auth";
import { api, ApiError } from "../../shared/api/client";
import { haptic } from "../../shared/hooks/useHaptics";
import { Icon } from "../../shared/ui/icons";
import type { IconName } from "../../shared/ui/icons";
import { Button, IconButton, IconTile, Notice, Segmented } from "../../shared/ui/primitives";
import type { Tone } from "../../shared/ui/primitives";

type Goal = "lose" | "gain" | "maintain" | "health";

interface Answers {
  goal: Goal | null;
  sex: "male" | "female" | "unspecified";
  height_cm: string;
  weight_kg: string;
  goal_weight_kg: string;
  place: "gym" | "home";
  experience: "beginner" | "intermediate" | "advanced";
  training_days: number[];
  session_minutes: 45 | 60 | 75 | 90;
  quit_habits: string[];
  build_habits: string[];
  supplements: string[];
  custom_supplements: string[];
  bedtime: string;
  wake_time: string;
  commute_minutes: number;
}

interface Summary {
  goal: string;
  protein_target_g: number;
  water_target_ml: number;
  bedtime: string;
  created: {
    programs: { id: number; name: string; days: string[] }[];
    habits: string[];
    supplements: string[];
  };
}

const GOALS: { id: Goal; title: string; text: string; icon: IconName; tone: Tone }[] = [
  { id: "lose", title: "Похудеть", text: "Снизить вес, сохранив мышцы", icon: "trendDown", tone: "teal" },
  { id: "gain", title: "Набрать мышцы", text: "Сила и объём, больше белка", icon: "dumbbell", tone: "purple" },
  { id: "maintain", title: "Держать форму", text: "Стабильный вес и регулярность", icon: "target", tone: "blue" },
  { id: "health", title: "Здоровье и энергия", text: "Сон, привычки, самочувствие", icon: "heart", tone: "pink" },
];

const QUIT: { id: string; label: string }[] = [
  { id: "sugar", label: "Сладкое" },
  { id: "soda", label: "Сладкие напитки" },
  { id: "fastfood", label: "Фастфуд" },
  { id: "late_food", label: "Еда после 21:00" },
  { id: "alcohol", label: "Алкоголь" },
  { id: "smoking", label: "Курение" },
];

const BUILD: { id: string; label: string }[] = [
  { id: "walk", label: "Прогулки" },
  { id: "steps", label: "10 000 шагов" },
  { id: "stretch", label: "Растяжка" },
  { id: "reading", label: "Чтение" },
  { id: "meditation", label: "Медитация" },
  { id: "no_phone", label: "Без телефона перед сном" },
];

const SUPPLEMENTS: { id: string; label: string }[] = [
  { id: "creatine", label: "Креатин" },
  { id: "protein", label: "Протеин" },
  { id: "vitamin_d", label: "Витамин D" },
  { id: "omega3", label: "Омега-3" },
  { id: "magnesium", label: "Магний" },
  { id: "multivitamin", label: "Мультивитамины" },
];

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

const STEPS = ["welcome", "goal", "body", "training", "habits", "sleep", "supplements"] as const;
type Step = (typeof STEPS)[number] | "done";

const DEFAULTS: Answers = {
  goal: null,
  sex: "unspecified",
  height_cm: "",
  weight_kg: "",
  goal_weight_kg: "",
  place: "gym",
  experience: "beginner",
  training_days: [0, 2, 4],
  session_minutes: 60,
  quit_habits: [],
  build_habits: [],
  supplements: [],
  custom_supplements: [],
  bedtime: "23:00",
  wake_time: "07:00",
  commute_minutes: 30,
};

/**
 * Стартовый опрос. Шесть коротких экранов, обязателен только выбор цели.
 *
 * Ответы не складываются в анкету «на потом» — сервер сразу превращает
 * их в цели по белку и воде, программу тренировок в расписании, привычки
 * и добавки. Человек заканчивает опрос на уже заполненном «Сегодня».
 */
export function OnboardingScreen({ onDone }: { onDone?: () => void }) {
  const { user, settings, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const previous = settings?.onboarding_answers as Partial<Answers> | undefined;
  const [answers, setAnswers] = useState<Answers>(() => ({ ...DEFAULTS, ...(previous ?? {}) }));
  const [step, setStep] = useState<Step>("welcome");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [customSupplement, setCustomSupplement] = useState("");

  const index = step === "done" ? STEPS.length : STEPS.indexOf(step);
  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((current) => ({ ...current, [key]: value }));
  const toggle = (key: "quit_habits" | "build_habits" | "supplements" | "training_days", value: string | number) => {
    haptic("tap");
    setAnswers((current) => {
      const list = current[key] as (string | number)[];
      const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
      return { ...current, [key]: key === "training_days" ? (next as number[]).sort() : next };
    });
  };

  const finishApp = async () => {
    await refreshUser();
    await queryClient.invalidateQueries();
    onDone?.();
  };

  const skipAll = async () => {
    setBusy(true);
    try {
      await api.post("/accounts/onboarding/", { skip: true });
      await finishApp();
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...answers,
        height_cm: answers.height_cm.replace(",", ".") || null,
        weight_kg: answers.weight_kg.replace(",", ".") || null,
        goal_weight_kg:
          answers.goal === "lose" || answers.goal === "gain"
            ? answers.goal_weight_kg.replace(",", ".") || null
            : null,
      };
      const result = await api.post<Summary>("/accounts/onboarding/", payload);
      haptic("success");
      setSummary(result);
      setStep("done");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.firstMessage : "Не получилось сохранить. Попробуй ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (step === "supplements") {
      void submit();
      return;
    }
    const position = STEPS.indexOf(step as (typeof STEPS)[number]);
    setStep(STEPS[position + 1]);
    window.scrollTo({ top: 0 });
  };

  const back = () => {
    const position = STEPS.indexOf(step as (typeof STEPS)[number]);
    if (position > 0) setStep(STEPS[position - 1]);
  };

  const canContinue = useMemo(() => {
    if (step === "goal") return answers.goal !== null;
    return true;
  }, [step, answers.goal]);

  if (step === "done" && summary) {
    return <DoneScreen summary={summary} onFinish={() => void finishApp()} busy={busy} />;
  }

  return (
    <div className="onboarding">
      {step !== "welcome" && (
        <header className="onboarding__top">
          <IconButton icon="chevronLeft" label="Назад" variant="plain" onClick={back} />
          <div className="onboarding__progress" aria-label={`Шаг ${index} из ${STEPS.length - 1}`}>
            <div
              className="onboarding__progress-fill"
              style={{ width: `${(index / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
          {step !== "goal" ? (
            <button type="button" className="card__action card__action--muted" onClick={next}>
              Пропустить
            </button>
          ) : (
            <span style={{ width: "var(--tap-min)" }} />
          )}
        </header>
      )}

      <main className="onboarding__body">
        {step === "welcome" && (
          <div className="onboarding__welcome">
            <div className="onboarding__hero" aria-hidden="true">
              <span className="onboarding__hero-ring" />
              <Icon name="sparkle" size={44} />
            </div>
            <h1 className="onboarding__title">
              Привет{user?.display_name ? `, ${user.display_name}` : ""}!
            </h1>
            <p className="muted onboarding__lead">
              Шесть коротких вопросов — и приложение настроится само: цели по белку
              и воде, программа тренировок по твоим дням, привычки и режим сна.
            </p>
            <ul className="onboarding__perks">
              <Perk icon="timer" tone="blue">Около минуты</Perk>
              <Perk icon="edit" tone="purple">Любой ответ потом можно поменять</Perk>
              <Perk icon="lock" tone="teal">Ответы видишь только ты</Perk>
            </ul>
          </div>
        )}

        {step === "goal" && (
          <Question title="Какая главная цель?" hint="От неё зависят цели по белку и формат тренировок.">
            <div className="stack stack--tight">
              {GOALS.map((goal) => (
                <ChoiceCard
                  key={goal.id}
                  icon={goal.icon}
                  tone={goal.tone}
                  title={goal.title}
                  text={goal.text}
                  selected={answers.goal === goal.id}
                  onClick={() => {
                    haptic("tap");
                    set("goal", goal.id);
                  }}
                />
              ))}
            </div>
          </Question>
        )}

        {step === "body" && (
          <Question title="Немного о тебе" hint="Чтобы посчитать белок и воду. Можно пропустить.">
            <span className="field__label">Пол</span>
            <Segmented
              label="Пол"
              value={answers.sex}
              onChange={(value) => set("sex", value)}
              options={[
                { id: "male", label: "Мужской" },
                { id: "female", label: "Женский" },
                { id: "unspecified", label: "Не указывать" },
              ]}
            />
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <NumberInput label="Рост" unit="см" value={answers.height_cm} onChange={(value) => set("height_cm", value)} />
              <NumberInput label="Вес сейчас" unit="кг" value={answers.weight_kg} onChange={(value) => set("weight_kg", value)} />
            </div>
            {(answers.goal === "lose" || answers.goal === "gain") && (
              <div style={{ marginTop: "var(--space-3)" }}>
                <NumberInput
                  label="Желаемый вес"
                  unit="кг"
                  value={answers.goal_weight_kg}
                  onChange={(value) => set("goal_weight_kg", value)}
                />
              </div>
            )}
          </Question>
        )}

        {step === "training" && (
          <Question title="Как будешь тренироваться?" hint="Соберём программу и поставим её в расписание.">
            <div className="grid-2" style={{ marginBottom: "var(--space-4)" }}>
              <ChoiceCard
                compact
                icon="dumbbell"
                tone="blue"
                title="В зале"
                selected={answers.place === "gym"}
                onClick={() => set("place", "gym")}
              />
              <ChoiceCard
                compact
                icon="home"
                tone="orange"
                title="Дома"
                text="гантели и свой вес"
                selected={answers.place === "home"}
                onClick={() => set("place", "home")}
              />
            </div>

            <span className="field__label">Опыт</span>
            <Segmented
              label="Опыт"
              value={answers.experience}
              onChange={(value) => set("experience", value)}
              options={[
                { id: "beginner", label: "Новичок" },
                { id: "intermediate", label: "Есть опыт" },
                { id: "advanced", label: "Продвинутый" },
              ]}
            />

            <span className="field__label">
              Дни тренировок · {answers.training_days.length || "без плана"}
            </span>
            <div className="weekday-picker" role="group" aria-label="Дни тренировок">
              {WEEKDAYS.map((day, weekday) => (
                <button
                  key={day}
                  type="button"
                  className="weekday-picker__day"
                  aria-pressed={answers.training_days.includes(weekday)}
                  onClick={() => toggle("training_days", weekday)}
                >
                  {day}
                </button>
              ))}
            </div>

            <span className="field__label">Длительность тренировки</span>
            <Segmented
              label="Длительность тренировки"
              value={String(answers.session_minutes)}
              onChange={(value) => set("session_minutes", Number(value) as Answers["session_minutes"])}
              options={[45, 60, 75, 90].map((minutes) => ({ id: String(minutes), label: `${minutes} мин` }))}
            />
          </Question>
        )}

        {step === "habits" && (
          <Question title="Привычки" hint="Счётчик дней появится на главном экране. Срыв не обнуляет накопленное.">
            <span className="field__label">От чего хочешь отказаться?</span>
            <ChipGroup
              options={QUIT}
              selected={answers.quit_habits}
              onToggle={(id) => toggle("quit_habits", id)}
            />
            <span className="field__label" style={{ marginTop: "var(--space-4)", display: "block" }}>
              Что хочешь делать регулярно?
            </span>
            <ChipGroup
              options={BUILD}
              selected={answers.build_habits}
              onToggle={(id) => toggle("build_habits", id)}
            />
          </Question>
        )}

        {step === "sleep" && (
          <Question
            title="Сон"
            hint="Сон — самый недооценённый фактор прогресса. Подскажем, во сколько выйти из зала, чтобы лечь вовремя."
          >
            <div className="grid-2" style={{ marginBottom: "var(--space-4)" }}>
              <label className="field">
                <span className="field__label">Ложусь в</span>
                <input type="time" value={answers.bedtime} onChange={(event) => set("bedtime", event.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">Встаю в</span>
                <input type="time" value={answers.wake_time} onChange={(event) => set("wake_time", event.target.value)} />
              </label>
            </div>
            <span className="field__label">Дорога из зала домой</span>
            <Segmented
              label="Дорога из зала домой"
              value={String(answers.commute_minutes)}
              onChange={(value) => set("commute_minutes", Number(value))}
              options={[0, 15, 30, 45, 60].map((minutes) => ({
                id: String(minutes),
                label: minutes === 0 ? "дома" : `${minutes}`,
              }))}
            />
            <p className="tiny">Минуты. «Дома» — если тренируешься дома.</p>
          </Question>
        )}

        {step === "supplements" && (
          <Question title="Что принимаешь?" hint="Отмечать можно будет одним тапом на главном экране.">
            <ChipGroup
              options={[
                ...SUPPLEMENTS,
                ...answers.custom_supplements.map((name) => ({ id: `custom:${name}`, label: name })),
              ]}
              selected={[
                ...answers.supplements,
                ...answers.custom_supplements.map((name) => `custom:${name}`),
              ]}
              onToggle={(id) => {
                if (id.startsWith("custom:")) {
                  const name = id.slice(7);
                  set("custom_supplements", answers.custom_supplements.filter((item) => item !== name));
                } else {
                  toggle("supplements", id);
                }
              }}
            />
            <div className="input-action" style={{ marginTop: "var(--space-3)" }}>
              <input
                value={customSupplement}
                placeholder="Своё: например, железо"
                aria-label="Добавить свою добавку"
                onChange={(event) => setCustomSupplement(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && customSupplement.trim()) {
                    set("custom_supplements", [...answers.custom_supplements, customSupplement.trim()]);
                    setCustomSupplement("");
                  }
                }}
              />
              <IconButton
                icon="plus"
                label="Добавить"
                variant="primary"
                onClick={() => {
                  if (!customSupplement.trim()) return;
                  set("custom_supplements", [...answers.custom_supplements, customSupplement.trim()]);
                  setCustomSupplement("");
                }}
              />
            </div>
          </Question>
        )}

        {error && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <Notice>{error}</Notice>
          </div>
        )}
      </main>

      <footer className="onboarding__footer">
        <Button variant="primary" size="lg" disabled={!canContinue || busy} onClick={next}>
          {step === "welcome"
            ? "Начать"
            : step === "supplements"
              ? busy
                ? "Настраиваем…"
                : "Готово"
              : "Дальше"}
        </Button>
        {step === "welcome" && (
          <Button variant="ghost" disabled={busy} onClick={() => void skipAll()}>
            Настрою сам
          </Button>
        )}
      </footer>
    </div>
  );
}

function DoneScreen({ summary, onFinish, busy }: { summary: Summary; onFinish: () => void; busy: boolean }) {
  const { programs, habits, supplements } = summary.created;
  return (
    <div className="onboarding">
      <main className="onboarding__body">
        <div className="onboarding__welcome" style={{ paddingTop: "var(--space-5)" }}>
          <div className="onboarding__hero onboarding__hero--done" aria-hidden="true">
            <span className="onboarding__hero-ring" />
            <Icon name="check" size={44} strokeWidth={2.6} />
          </div>
          <h1 className="onboarding__title">Всё готово!</h1>
          <p className="muted onboarding__lead">
            {summary.goal ? `Цель — ${summary.goal.toLowerCase()}. ` : ""}
            Вот что настроено. Всё можно поменять в профиле.
          </p>
        </div>

        <div className="grid-2">
          <SummaryStat icon="protein" tone="green" label="Белок в день" value={`${summary.protein_target_g} г`} />
          <SummaryStat
            icon="water"
            tone="sky"
            label="Вода в день"
            value={`${(summary.water_target_ml / 1000).toLocaleString("ru-RU")} л`}
          />
        </div>

        {programs.length > 0 && (
          <section className="card">
            <header className="card__head">
              <IconTile icon="dumbbell" tone="purple" size="sm" />
              <h2 className="card__title">Программа тренировок</h2>
            </header>
            {programs.map((program) => (
              <p key={program.id} className="row row--between" style={{ padding: "var(--space-1) 0" }}>
                <span className="strong">{program.name}</span>
                <span className="badge tone-purple">{program.days.join(", ")}</span>
              </p>
            ))}
          </section>
        )}

        {(habits.length > 0 || supplements.length > 0) && (
          <section className="card">
            <header className="card__head">
              <IconTile icon="leaf" tone="teal" size="sm" />
              <h2 className="card__title">На главном экране</h2>
            </header>
            <div className="row row--wrap">
              {[...habits, ...supplements].map((name) => (
                <span key={name} className="tag tone-teal">
                  {name}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="card card--tinted tone-purple">
          <div className="tile-row">
            <IconTile icon="moon" tone="purple" />
            <span className="tile-row__text">
              <span className="tile-row__title">Отбой в {summary.bedtime}</span>
              <span className="tile-row__meta">Вечером подскажем, когда пора выходить из зала.</span>
            </span>
          </div>
        </section>
      </main>
      <footer className="onboarding__footer">
        <Button variant="primary" size="lg" disabled={busy} onClick={onFinish}>
          Поехали
        </Button>
      </footer>
    </div>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="onboarding__question">
      <h1 className="onboarding__title">{title}</h1>
      {hint && <p className="muted onboarding__lead">{hint}</p>}
      <div className="stack stack--tight">{children}</div>
    </section>
  );
}

function ChoiceCard({
  icon,
  tone,
  title,
  text,
  selected,
  onClick,
  compact,
}: {
  icon: IconName;
  tone: Tone;
  title: string;
  text?: string;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`choice-card ${compact ? "choice-card--compact" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <IconTile icon={icon} tone={tone} size={compact ? "md" : "lg"} />
      <span className="tile-row__text">
        <span className="tile-row__title">{title}</span>
        {text && <span className="tile-row__meta">{text}</span>}
      </span>
      {!compact && (
        <span className="choice-card__check" aria-hidden="true">
          {selected && <Icon name="check" size={14} strokeWidth={3} />}
        </span>
      )}
    </button>
  );
}

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="row row--wrap">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="chip"
          aria-pressed={selected.includes(option.id)}
          onClick={() => onToggle(option.id)}
        >
          {selected.includes(option.id) && <Icon name="check" size={14} strokeWidth={2.6} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="unit-input">
        <input
          inputMode="decimal"
          value={value}
          placeholder="—"
          onChange={(event) => onChange(event.target.value.replace(/[^\d.,]/g, ""))}
        />
        <span className="unit-input__unit">{unit}</span>
      </span>
    </label>
  );
}

function Perk({ icon, tone, children }: { icon: IconName; tone: Tone; children: ReactNode }) {
  return (
    <li className="feature-list__item">
      <IconTile icon={icon} tone={tone} size="sm" />
      <span>{children}</span>
    </li>
  );
}

function SummaryStat({ icon, tone, label, value }: { icon: IconName; tone: Tone; label: string; value: string }) {
  return (
    <section className="card">
      <IconTile icon={icon} tone={tone} size="sm" />
      <p className="stat__label" style={{ marginTop: "var(--space-2)" }}>
        {label}
      </p>
      <p className="big-number">{value}</p>
    </section>
  );
}
