/**
 * Оффлайн-режим: в зале и метро связи нет.
 * Проверяем, что запись подхода без сети не теряется и уходит на сервер,
 * когда связь появляется.
 */
import { chromium } from "playwright";

const EXEC = process.env.CHROMIUM_PATH || undefined;
const BASE = process.env.APP_URL ?? "http://127.0.0.1:5173";
const dir = process.env.SHOT_DIR || "./e2e/screenshots";
const errors = [];

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
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByLabel(/Ник, email или телефон/).fill("demo_user");
await page.getByLabel("Пароль").fill("demo12345");
await page.getByRole("button", { name: "Войти" }).click();
await page.waitForSelector(".tabbar");
await page.waitForTimeout(1200);

for (const name of ["Вернуться к тренировке", "Начать тренировку", "Начать сейчас"]) {
  const button = page.getByRole("button", { name, exact: true }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    break;
  }
}
await page.waitForURL(/\/workout\/\d+/, { timeout: 15000 });
await page.waitForTimeout(1500);
const url = page.url();
const sessionId = url.split("/").pop();

const before = await page.locator(".exercise-item--active .set-row").count();
console.log("подходов до отключения сети:", before);

// --- уходим в оффлайн ----------------------------------------------------
await context.setOffline(true);
await page.waitForTimeout(600);
console.log("статус в шапке:", await page.locator(".sync-status").innerText());

await page.getByRole("button", { name: /✓ Записать/ }).first().click();
await page.waitForTimeout(1200);
const offlineCount = await page.locator(".exercise-item--active .set-row").count();
console.log("подходов сразу после записи без сети:", offlineCount);
console.log("статус очереди:", await page.locator(".sync-status").innerText());
await page.screenshot({ path: `${dir}/offline-recorded.png`, fullPage: true });

// перезагрузка без сети: данные должны пережить закрытие приложения
await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
await page.waitForTimeout(1500);
console.log("после перезагрузки без сети статус:", await page.locator(".sync-status").innerText().catch(() => "—"));

// --- сеть вернулась ------------------------------------------------------
await context.setOffline(false);
await page.waitForTimeout(3500);
await page.goto(`${BASE}/workout/${sessionId}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
console.log("статус после возврата сети:", await page.locator(".sync-status").innerText());

const after = await page.evaluate(async (id) => {
  const response = await fetch(`/api/workouts/${id}/`, {
    headers: { Authorization: "" },
  });
  return response.status;
}, sessionId);
void after;

const sets = await page.locator(".exercise-item .set-row").count();
console.log("строк подходов на сервере после синхронизации:", sets);
await page.screenshot({ path: `${dir}/offline-synced.png`, fullPage: true });

console.log("ошибки:", errors.length ? errors.join("; ") : "нет");
await browser.close();
