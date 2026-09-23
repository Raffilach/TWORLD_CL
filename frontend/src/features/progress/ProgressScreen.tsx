import { useState } from "react";

import { Segmented } from "../../shared/ui/primitives";
import { MuscleLoadTab } from "../musclemap/MuscleLoadTab";
import { AnalyticsTab } from "./AnalyticsTab";
import { BodyTab } from "./BodyTab";
import { HabitsTab } from "./HabitsTab";
import { JournalTab } from "../journal/JournalTab";
import { NutritionTab } from "./NutritionTab";
import { OverviewTab } from "./OverviewTab";
import { ReportTab } from "./ReportTab";
import { SafetyTab } from "./SafetyTab";
import { SleepTab } from "./SleepTab";

type Tab =
  | "overview"
  | "muscles"
  | "body"
  | "sleep"
  | "nutrition"
  | "habits"
  | "safety"
  | "journal"
  | "analytics"
  | "report";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Неделя" },
  { id: "muscles", label: "Мышцы" },
  { id: "body", label: "Тело" },
  { id: "sleep", label: "Сон" },
  { id: "nutrition", label: "Питание" },
  { id: "habits", label: "Привычки" },
  { id: "safety", label: "Травмы" },
  { id: "journal", label: "Дневник" },
  { id: "analytics", label: "Аналитика" },
  { id: "report", label: "Отчёт" },
];

export function ProgressScreen() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <>
      <Segmented label="Раздел прогресса" options={TABS} value={tab} onChange={setTab} scroll />

      {tab === "overview" && <OverviewTab />}
      {tab === "muscles" && <MuscleLoadTab />}
      {tab === "body" && <BodyTab />}
      {tab === "sleep" && <SleepTab />}
      {tab === "nutrition" && <NutritionTab />}
      {tab === "habits" && <HabitsTab />}
      {tab === "safety" && <SafetyTab />}
      {tab === "journal" && <JournalTab />}
      {tab === "analytics" && <AnalyticsTab />}
      {tab === "report" && <ReportTab />}
    </>
  );
}
