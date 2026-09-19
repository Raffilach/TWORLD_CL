/// <reference lib="webworker" />
/**
 * Service Worker.
 *
 * Делает две вещи: кэширует оболочку и данные, чтобы приложение открывалось
 * без сети, и принимает пуш-уведомления. Уведомления нейтральные и с одним
 * действием — «ввести вес» прямо из шторки, чтобы утреннее взвешивание
 * не требовало открывать приложение.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

// Данные: сначала сеть, но с коротким таймаутом — в метро ждать нечего.
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "tworld-api",
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 })],
  }),
);

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: {
    title?: string;
    body?: string;
    url?: string;
    kind?: string;
    actions?: { action: string; title: string }[];
  } = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "TWORLD", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "TWORLD", {
      body: payload.body ?? "",
      tag: payload.kind ?? "tworld",
      data: { url: payload.url ?? "/" },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // `actions` есть не во всех браузерах, поэтому расширяем тип точечно.
      ...(payload.actions?.length ? { actions: payload.actions } : {}),
    } as NotificationOptions),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // «Ввести вес» открывает главный экран сразу в режиме ввода.
  const base = (event.notification.data?.url as string) ?? "/";
  const target = event.action === "weight" ? "/?quick=weight" : base;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
