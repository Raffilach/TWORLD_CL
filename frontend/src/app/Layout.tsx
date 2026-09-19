import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api } from "../shared/api/client";
import type { WorkoutSession } from "../shared/api/types";
import { useSyncStatus } from "../shared/hooks/useOnline";
import { SessionClock } from "../shared/ui/timers";

const TABS = [
  { to: "/", label: "Сегодня", icon: "◉" },
  { to: "/training", label: "Тренировки", icon: "▤" },
  { to: "/progress", label: "Прогресс", icon: "◫" },
  { to: "/friends", label: "Друзья", icon: "◍" },
  { to: "/profile", label: "Профиль", icon: "☰" },
];

const TITLES: Record<string, string> = {
  "/": "Сегодня",
  "/training": "Тренировки",
  "/progress": "Прогресс",
  "/friends": "Друзья",
  "/profile": "Профиль",
};

export function Layout() {
  const location = useLocation();
  const { online, pending } = useSyncStatus();

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

  return (
    <div className="app">
      <nav className="tabbar" aria-label="Основная навигация">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} className="tabbar__item">
            <span className="tabbar__icon" aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="grow" style={{ minWidth: 0 }}>
        <header className="app__header">
          <h1 className="app__title">{TITLES[location.pathname] ?? "TWORLD"}</h1>
          <span className="sync-status">
            {!online ? "Оффлайн" : pending > 0 ? `${pending} ждут сети` : "Синхронизировано"}
          </span>
        </header>

        <main className="app__main app-scroll">
          <Outlet />
        </main>
      </div>

      {active && location.pathname !== `/workout/${active.id}` && (
        <NavLink to={`/workout/${active.id}`} className="active-session">
          <span>Тренировка идёт</span>
          <SessionClock startedAt={active.started_at} />
          <span aria-hidden="true">→</span>
        </NavLink>
      )}
    </div>
  );
}
