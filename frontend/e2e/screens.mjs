/**
 * Прогон по всем разделам «Прогресса»: проверяем, что каждая вкладка
 * рендерится без ошибок и что формы ввода открываются.
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
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByLabel(/Ник, email или телефон/).fill("demo_user");
await page.getByLabel("Пароль").fill("demo12345");
await page.getByRole("button", { name: "Войти" }).click();
await page.waitForSelector(".tabbar");

await page.getByRole("link", { name: "Прогресс" }).click();
await page.waitForTimeout(2000);

for (const tab of ["Неделя", "Тело", "Сон", "Питание", "Привычки", "Травмы", "Дневник", "Аналитика", "Отчёт"]) {
  await page.getByRole("button", { name: tab, exact: true }).click();
  await page.waitForTimeout(1400);
  const text = await page.locator(".app__main").innerText();
  console.log(`\n=== ${tab} ===`);
  console.log(text.split("\n").slice(0, 14).join(" | "));
  await page.screenshot({ path: `${dir}/tab-${tab}.png`, fullPage: true });
}

// Формы ввода открываются
await page.getByRole("button", { name: "Травмы", exact: true }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Отметить травму" }).click();
await page.waitForTimeout(800);
const zones = await page.locator('.sheet svg [role="button"]').count();
console.log("\n=== КАРТА ТЕЛА ===");
console.log("зон на карте:", zones);
await page.screenshot({ path: `${dir}/tab-bodymap.png`, fullPage: true });

console.log("\nошибки в консоли:", errors.length ? errors.join("; ") : "нет");
await browser.close();
