/** Проверка форм ввода: создание программы и запись травмы доходят до базы. */
import { chromium } from "playwright";

const EXEC = process.env.CHROMIUM_PATH || undefined;
const BASE = process.env.APP_URL ?? "http://127.0.0.1:5174";
const dir = process.env.SHOT_DIR || "./e2e/screenshots";
const errors = [];

const browser = await chromium.launch({
  ...(EXEC ? { executablePath: EXEC } : {}),
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByLabel(/Ник, email или телефон/).fill("demo_user");
await page.getByLabel("Пароль").fill("demo12345");
await page.getByRole("button", { name: "Войти" }).click();
await page.waitForSelector(".tabbar");

// --- создание программы -------------------------------------------------
await page.getByRole("link", { name: "Тренировки" }).click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Новая программа" }).click();
await page.waitForTimeout(500);
const stamp = Date.now().toString().slice(-5);
await page.getByLabel("Название").fill(`Тест ${stamp}`);
await page.getByRole("button", { name: "вт", exact: true }).click();
await page.getByRole("button", { name: "Создать", exact: true }).click();
await page.waitForURL(/\/training\/templates\/\d+/, { timeout: 15000 });
await page.waitForTimeout(1200);
console.log("=== ПРОГРАММА СОЗДАНА ===");
console.log((await page.locator(".app__main").innerText()).split("\n").slice(0, 10).join(" | "));

// --- добавление упражнения в обязательный блок ---------------------------
await page.getByRole("button", { name: "Добавить упражнение" }).first().click();
await page.waitForTimeout(500);
await page.getByLabel("Поиск").fill("Жим штанги лёжа");
await page.waitForTimeout(1200);
await page.locator(".sheet .list__item").first().click();
await page.waitForTimeout(400);
await page.locator(".sheet").getByRole("button", { name: "Добавить", exact: true }).click();
await page.waitForTimeout(1500);
const afterAdd = await page.locator(".app__main").innerText();
console.log("\n=== ПОСЛЕ ДОБАВЛЕНИЯ ===");
console.log(afterAdd.includes("Жим штанги лёжа") ? "упражнение в плане ✓" : "упражнение НЕ добавилось ✗");
console.log(afterAdd.split("\n").filter((l) => l.includes("мин")).slice(0, 2).join(" | "));
await page.screenshot({ path: `${dir}/flow-template.png`, fullPage: true });

// --- запись травмы по карте тела -----------------------------------------
await page.getByRole("link", { name: "Прогресс" }).click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Травмы", exact: true }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Отметить травму" }).click();
await page.waitForTimeout(600);
await page.locator('.sheet svg [role="button"][aria-label="Колено правое"]').click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "правая", exact: true }).click();
await page.getByLabel("Что произошло").fill("Тест из e2e");
await page.locator(".sheet").getByRole("button", { name: "Сохранить", exact: true }).click();
await page.waitForTimeout(1800);
const injuryResult = await page.locator(".sheet").innerText();
console.log("\n=== ТРАВМА ЗАПИСАНА ===");
console.log(injuryResult.split("\n").slice(0, 6).join(" | "));
await page.screenshot({ path: `${dir}/flow-injury.png`, fullPage: true });

console.log("\nошибки в консоли:", errors.length ? errors.join("; ") : "нет");
await browser.close();
