import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // В разработке фронтенд ходит по относительному /api, а Vite проксирует
  // запросы на бэкенд — так не нужен CORS и не нужно хардкодить адрес.
  const proxyTarget = (env.VITE_DEV_API_PROXY || env.VITE_API_URL || "http://localhost:8000")
    .replace(/\/api\/?$/, "");

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "icons/*.png"],
        manifest: {
          name: "TWORLD",
          short_name: "TWORLD",
          description: "Трекер тренировок, привычек и дневника",
          lang: "ru",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          // Цвета берутся из токенов — здесь нейтральные заглушки.
          background_color: "#ffffff",
          theme_color: "#ffffff",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "/icons/icon-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          navigateFallback: "/index.html",
          runtimeCaching: [
            {
              // Данные читаются из кэша мгновенно, обновляются в фоне.
              // В зале и метро сети нет — это нормальный режим работы.
              urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
              handler: "NetworkFirst",
              options: {
                cacheName: "tworld-api",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    // Те же правила для `vite preview`: собранное приложение должно
    // проверяться с работающим Service Worker и живым API.
    preview: {
      port: 4173,
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
        "/media": { target: proxyTarget, changeOrigin: true },
        "^/s/[A-Za-z0-9_-]+$": { target: proxyTarget, changeOrigin: true },
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
        "/media": { target: proxyTarget, changeOrigin: true },
        // Публичные ссылки на отчёты. Ключ — регулярное выражение, иначе
        // префикс "/s" перехватил бы и "/src/..." в разработке.
        "^/s/[A-Za-z0-9_-]+$": { target: proxyTarget, changeOrigin: true },
      },
    },
    build: {
      target: "es2020",
      sourcemap: true,
      rollupOptions: {
        output: {
          // Графики весят больше всего и нужны только на «Прогрессе».
          // В зале с мобильным интернетом это заметная разница.
          manualChunks: {
            charts: ["recharts"],
            vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          },
        },
      },
    },
  };
});
