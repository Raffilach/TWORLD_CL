/**
 * Оффлайн на собранном приложении: Service Worker должен отдавать
 * оболочку и кэш, когда сети нет совсем — это сценарий метро.
 */
import { chromium } from "playwright";

const EXEC = process.env.CHROMIUM_PATH || undefined;
const BASE = process.env.APP_URL ?? "http://127.0.0.1:4173";
const dir = process.env.SHOT_DIR || "./e2e/screenshots";

const browser = await chromium.launch({
  ...(EXEC ? { executablePath: EXEC } : {}),
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByLabel(/Ник, email или телефон/).fill("demo_user");
await page.getByLabel("Пароль").fill("demo12345");
await page.getByRole("button", { name: "Войти" }).click();
await page.waitForSelector(".tabbar");
await page.waitForTimeout(3000);

const sw = await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  return {
    registered: Boolean(registration),
    active: Boolean(registration?.active),
    scope: registration?.scope ?? null,
  };
});
console.log("Service Worker:", sw);

// Прогреваем кэш основных экранов
for (const tab of ["Тренировки", "Профиль", "Сегодня"]) {
  await page.getByRole("link", { name: tab }).click();
  await page.waitForTimeout(1200);
}

// --- полный оффлайн ------------------------------------------------------
await context.setOffline(true);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const visible = await page.locator(".tabbar").isVisible().catch(() => false);
const body = await page.locator("body").innerText().catch(() => "");
console.log("\n=== ПОСЛЕ ПЕРЕЗАГРУЗКИ БЕЗ СЕТИ ===");
console.log("оболочка загрузилась:", visible);
console.log("на экране:", body.split("\n").filter(Boolean).slice(0, 8).join(" | "));
await page.screenshot({ path: `${dir}/offline-pwa.png`, fullPage: true });

await browser.close();
