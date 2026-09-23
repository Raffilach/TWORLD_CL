import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, auth as tokens, ensureAccessToken } from "../shared/api/client";
import type { User, UserSettings } from "../shared/api/types";
import { cacheGet, cacheSet } from "../shared/offline/db";

interface AuthContextValue {
  user: User | null;
  settings: UserSettings | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  patchSettings: (patch: Partial<UserSettings>) => Promise<void>;
}

export interface RegisterPayload {
  username: string;
  email?: string;
  phone?: string;
  password: string;
  display_name?: string;
  invite_code?: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const [me, userSettings] = await Promise.all([
      api.get<User>("/accounts/me/"),
      api.get<UserSettings>("/accounts/settings/"),
    ]);
    setUser(me);
    setSettings(userSettings);
    void cacheSet("me", me);
    void cacheSet("settings", userSettings);
  }, []);

  useEffect(() => {
    (async () => {
      // Оффлайн-старт: показываем кэш, не выкидывая на экран входа.
      const cachedUser = await cacheGet<User>("me");
      const cachedSettings = await cacheGet<UserSettings>("settings");
      if (cachedUser && tokens.refresh) {
        setUser(cachedUser);
        if (cachedSettings) setSettings(cachedSettings);
      }
      if (tokens.refresh) {
        try {
          // Сначала обмениваем refresh на access — иначе каждый запрос
          // стартового экрана сперва получит 401 и пойдёт на второй круг.
          await ensureAccessToken();
          await loadProfile();
        } catch {
          if (!cachedUser) tokens.clear();
        }
      }
      setLoading(false);
    })();
  }, [loadProfile]);

  const login = useCallback(
    async (loginValue: string, password: string) => {
      const data = await api.post<{ access: string; refresh: string; user: User }>(
        "/auth/login/",
        { login: loginValue, password },
      );
      tokens.setTokens(data.access, data.refresh);
      await loadProfile();
    },
    [loadProfile],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const data = await api.post<{ access: string; refresh: string; user: User }>(
        "/auth/register/",
        payload,
      );
      tokens.setTokens(data.access, data.refresh);
      await loadProfile();
    },
    [loadProfile],
  );

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
    setSettings(null);
  }, []);

  const patchSettings = useCallback(async (patch: Partial<UserSettings>) => {
    const updated = await api.patch<UserSettings>("/accounts/settings/", patch);
    setSettings(updated);
    void cacheSet("settings", updated);
  }, []);

  const value = useMemo(
    () => ({ user, settings, loading, login, register, logout, refreshUser: loadProfile, patchSettings }),
    [user, settings, loading, login, register, logout, loadProfile, patchSettings],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth вне AuthProvider");
  return context;
}
