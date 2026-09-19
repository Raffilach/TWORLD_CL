import { chromium } from "playwright";

const EXEC = process.env.CHROMIUM_PATH || undefined;
const errors = [];
const browser = await chromium.launch({
  ...(EXEC ? { executablePath: EXEC } : {}),
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.message));

const dir = process.env.SHOT_DIR || "./e2e/screenshots";

await page.goto("http://127.0.0.1:5174", { waitUntil: "networkidle" });
await page.getByLabel(/Ник, email или телефон/).fill("demo_user");
await page.getByLabel("Пароль").fill("demo12345");
await page.getByRole("button", { name: "Войти" }).click();
await page.waitForSelector(".tabbar");
await page.waitForTimeout(1200);

// Старт тренировки одной кнопкой. Если сессия уже идёт — возвращаемся в неё.
// «Начать» в день по плану, «Начать сейчас» вне плана, «Вернуться» если уже идёт.
for (const name of ["Вернуться к тренировке", "Начать", "Начать сейчас"]) {
  const button = page.getByRole("button", { name, exact: true }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    break;
  }
}
await page.waitForURL(/\/workout\/\d+/, { timeout: 15000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${dir}/shot-07-workout.png`, fullPage: true });
console.log("--- ТРЕНИРОВКА ---\n" + (await page.locator(".app__main").innerText()).slice(0, 1200));

// Первое упражнение раскрыто автоматически — сразу записываем подход
const recordButton = page.getByRole("button", { name: /✓ Записать/ }).first();
const label = await recordButton.innerText();
console.log("\nкнопка записи:", label);
await recordButton.click();
await page.waitForTimeout(1800);

const hasRest = await page.locator(".rest-timer").isVisible();
console.log("таймер отдыха стартовал сам:", hasRest);
if (hasRest) console.log("значение таймера:", await page.locator(".rest-timer .mono").first().innerText());

const setsText = await page.locator(".exercise-item--active .list").first().innerText().catch(() => "");
console.log("записанные подходы:", setsText.replace(/\n+/g, " | "));
await page.screenshot({ path: `${dir}/shot-08-set-recorded.png`, fullPage: true });

// Шаг веса идёт по сетке тренажёра, а не по «+2,5»
const before = await page.locator(".stepper__value").first().innerText();
await page.locator(".stepper__btn").nth(1).click();
await page.waitForTimeout(400);
const after = await page.locator(".stepper__value").first().innerText();
console.log(`шаг по сетке зала: ${before.trim()} → ${after.trim()}`);

// Три состояния: «не смог» с причиной
await page.getByRole("button", { name: "Пропустить / не смог" }).first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${dir}/shot-09-fail-reasons.png`, fullPage: true });
console.log("\n--- ПРИЧИНЫ ---\n" + (await page.locator(".sheet").innerText()));

console.log("\nошибки в консоли:", errors.length ? errors.join("; ") : "нет");
await browser.close();
