/**
 * HTTP-клиент.
 *
 * Access-токен живёт в памяти, refresh — в localStorage: приложение
 * переживает перезапуск, но токен не попадает в разметку. При 401
 * выполняется тихое обновление и повтор запроса — пользователь этого
 * не замечает и ничего не теряет.
 */
const BASE = import.meta.env.VITE_API_URL ?? "/api";
const REFRESH_KEY = "tworld.refresh";

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export const auth = {
  get access() {
    return accessToken;
  },
  get refresh() {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  setTokens(access: string, refresh?: string) {
    accessToken = access;
    if (refresh) {
      try {
        localStorage.setItem(REFRESH_KEY, refresh);
      } catch {
        /* приватный режим — переживём без сохранения */
      }
    }
  },
  clear() {
    accessToken = null;
    try {
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ничего */
    }
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly data: unknown,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
  }

  /** Первое понятное человеку сообщение об ошибке поля. */
  get firstMessage(): string {
    const data = this.data as Record<string, unknown> | string | null;
    if (typeof data === "string") return data;
    if (!data) return this.message;
    for (const value of Object.values(data)) {
      if (typeof value === "string") return value;
      if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
    return this.message;
  }
}

async function refreshAccess(): Promise<boolean> {
  const token = auth.refresh;
  if (!token) return false;
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: token }),
    })
      .then(async (response) => {
        if (!response.ok) {
          auth.clear();
          return false;
        }
        const data = await response.json();
        auth.setTokens(data.access, data.refresh);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  raw?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
};

export async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, raw, query, headers, ...rest } = options;

  let url = path.startsWith("http") ? path : `${BASE}${path}`;
  if (query) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        search.set(key, String(value));
      }
    }
    const qs = search.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const isFormData = body instanceof FormData;
  const send = async (): Promise<Response> =>
    fetch(url, {
      ...rest,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });

  let response = await send();
  if (response.status === 401 && auth.refresh) {
    if (await refreshAccess()) response = await send();
  }

  if (!response.ok) {
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = await response.text().catch(() => null);
    }
    throw new ApiError(response.status, data);
  }

  if (raw) return (await response.text()) as T;
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Обновить access-токен заранее, до первых запросов после старта. */
export async function ensureAccessToken(): Promise<boolean> {
  if (accessToken) return true;
  if (!auth.refresh) return false;
  return refreshAccess();
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) =>
    request<T>(path, { method: "GET", query }),
  text: (path: string, query?: RequestOptions["query"]) =>
    request<string>(path, { method: "GET", query, raw: true }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function paged<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const data = payload as { results?: T[] } | null;
  return data?.results ?? [];
}
