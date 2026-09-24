import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { api } from "../shared/api/client";
import type { WorkoutSession } from "../shared/api/types";
import { useSyncStatus } from "../shared/hooks/useOnline";
import { Icon } from "../shared/ui/icons";
import type { IconName } from "../shared/ui/icons";
import { SessionClock } from "../shared/ui/timers";
import { HeaderActionProvider } from "./header";

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Сегодня", icon: "today" },
  { to: "/training", label: "Тренировки", icon: "dumbbell" },
  { to: "/progress", label: "Прогресс", icon: "chart" },
  { to: "/friends", label: "Друзья", icon: "users" },
  { to: "/profile", label: "Профиль", icon: "user" },
];

const TITLES: Record<string, string> = {
  "/": "Сегодня",
  "/training": "Тренировки",
  "/progress": "Прогресс",
  "/friends": "Друзья",
  "/profile": "Профиль",
};

/** «Вт, 12 марта» — как подпись под заголовком «Сегодня». */
function todayLabel() {
  const date = new Date();
  const weekday = date.toLocaleDateString("ru-RU", { weekday: "short" });
  const rest = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return `${weekday}, ${rest}`;
}

export function Layout() {
  const location = useLocation();
  const { online, pending } = useSyncStatus();
  const [action, setAction] = useState<ReactNode>(null);

  // Идущая тренировка доступна с любой вкладки одним тапом.
  const { data: active } = useQuery({
    queryKey: ["active-session"],
    queryFn: async () => {
      const response = await api.get<{ results: WorkoutSession[] }>("/workouts/", {
        status: "in_progress",
      });
      return response.results?.[0] ?? null;
    },
    refetchInterval: 60_000,
  });

  const isToday = location.pathname === "/";
  const syncState = !online ? "offline" : pending > 0 ? "pending" : "ok";
  const syncLabel = !online
    ? "Оффлайн"
    : pending > 0
      ? `${pending} ждут сети`
      : "Синхронизировано";

  return (
    <div className="app">
      <nav className="tabbar" aria-label="Основная навигация">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} className="tabbar__item">
            <span className="tabbar__icon" aria-hidden="true">
              <Icon name={tab.icon} size={24} />
            </span>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="grow" style={{ minWidth: 0 }}>
        <header className="app__header">
          <div className="app__header-text">
            <h1 className="app__title">{TITLES[location.pathname] ?? "TWORLD"}</h1>
            {isToday ? (
              <span className="app__subtitle">{todayLabel()}</span>
            ) : (
              <span className="sync-status" data-state={syncState}>
                {syncLabel}
              </span>
            )}
          </div>
          <div className="app__header-actions">
            {/* На «Сегодня» под заголовком дата, а статус сети появляется,
                только когда есть о чём сказать: оффлайн или очередь. */}
            {isToday && syncState !== "ok" && (
              <span className="sync-status" data-state={syncState}>
                {syncLabel}
              </span>
            )}
            {action}
          </div>
        </header>

        <main className="app__main app-scroll">
          <HeaderActionProvider onChange={setAction}>
            <Outlet />
          </HeaderActionProvider>
        </main>
      </div>

      {active && location.pathname !== `/workout/${active.id}` && (
        <NavLink to={`/workout/${active.id}`} className="active-session">
          <Icon name="dumbbell" size={20} />
          <span className="grow">Тренировка идёт</span>
          <SessionClock startedAt={active.started_at} />
          <span className="active-session__go" aria-hidden="true">
            <Icon name="chevronRight" size={18} strokeWidth={2.4} />
          </span>
        </NavLink>
      )}
    </div>
  );
}
