import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { UndoProvider } from "../shared/hooks/useUndo";
import { startAutoSync } from "../shared/offline/queue";
import { AuthProvider, useAuth } from "./auth";
import { AuthScreen } from "./AuthScreen";
import { Layout } from "./Layout";
import { TodayScreen } from "../features/today/TodayScreen";
import { TrainingScreen } from "../features/training/TrainingScreen";
import { TemplateScreen } from "../features/training/TemplateScreen";
import { ExerciseScreen } from "../features/training/ExerciseScreen";
import { SessionScreen } from "../features/training/SessionScreen";
import { FriendsScreen } from "../features/friends/FriendsScreen";

// Экран с графиками грузится отдельно: главный экран должен открываться
// мгновенно даже на медленном соединении.
const ProgressScreen = lazy(() =>
  import("../features/progress/ProgressScreen").then((module) => ({
    default: module.ProgressScreen,
  })),
);
import { ProfileScreen } from "../features/profile/ProfileScreen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Сеть может быть медленной или отсутствовать — не дёргаем сервер зря
      // и не показываем спиннеры на каждое переключение вкладки.
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
    },
    mutations: { networkMode: "offlineFirst" },
  },
});

function Routing() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth">
        <p className="muted">Загружаем…</p>
      </div>
    );
  }
  if (!user) return <AuthScreen />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<TodayScreen />} />
        <Route path="/training" element={<TrainingScreen />} />
        <Route path="/training/templates/:id" element={<TemplateScreen />} />
        <Route path="/training/exercises/:id" element={<ExerciseScreen />} />
        <Route
          path="/progress"
          element={
            <Suspense fallback={<p className="muted">Загружаем графики…</p>}>
              <ProgressScreen />
            </Suspense>
          }
        />
        <Route path="/friends" element={<FriendsScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
      </Route>
      <Route path="/workout/:id" element={<SessionScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  useEffect(() => startAutoSync(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UndoProvider>
          <BrowserRouter>
            <Routing />
          </BrowserRouter>
        </UndoProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
