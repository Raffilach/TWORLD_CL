import { useState } from "react";

import { Chip } from "../../shared/ui/primitives";
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
      <div className="row row--wrap" style={{ marginBottom: "var(--space-4)" }}>
        {TABS.map((item) => (
          <Chip key={item.id} small pressed={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </Chip>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
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
