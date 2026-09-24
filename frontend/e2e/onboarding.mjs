// Новый пользователь: регистрация → стартовый опрос → заполненный «Сегодня».
import { chromium } from "playwright";

const EXEC = process.env.CHROMIUM_PATH || undefined;
const BASE = process.env.APP_URL ?? "http://127.0.0.1:5173";
const dir = process.env.SHOT_DIR || "./e2e/screenshots";
const errors = [];

const browser = await chromium.launch({ ...(EXEC ? { executablePath: EXEC } : {}), args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  // Проверка продакшн-сборки на localhost: у Caddy там свой локальный сертификат.
  ignoreHTTPSErrors: Boolean(process.env.IGNORE_HTTPS_ERRORS),
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const shot = (name) => page.screenshot({ path: `${dir}/onboarding-${name}.png` });

const stamp = Date.now().toString().slice(-6);
await page.goto(`${BASE}${process.env.INVITE ? `/?invite=${process.env.INVITE}` : ""}`, { waitUntil: "networkidle" });
if (!process.env.INVITE) {
  await page.getByRole("button", { name: "Нет аккаунта — зарегистрироваться" }).click();
}
await page.getByLabel("Ник").fill(`beta_${stamp}`);
await page.getByLabel("Email или телефон").fill(`beta_${stamp}@example.com`);
await page.getByLabel("Как обращаться (необязательно)").fill("Алекс");
await page.getByLabel("Пароль").fill("beta-pass-123");
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Создать аккаунт" }).click();

await page.getByRole("button", { name: "Начать", exact: true }).waitFor({ timeout: 15000 });
await shot("01-welcome");
await page.getByRole("button", { name: "Начать", exact: true }).click();

// Цель обязательна: «Дальше» неактивна, пока не выбрано.
const nextButton = page.getByRole("button", { name: "Дальше" });
console.log("«Дальше» без цели заблокирована:", await nextButton.isDisabled());
await page.getByRole("button", { name: /Похудеть/ }).click();
await shot("02-goal");
await nextButton.click();

await page.getByRole("button", { name: "Женский" }).click();
await page.getByLabel("Рост").fill("168");
await page.getByLabel("Вес сейчас").fill("72,4");
await page.getByLabel("Желаемый вес").fill("65");
await shot("03-body");
await nextButton.click();

await page.getByRole("button", { name: "ср", exact: true }).click(); // снять среду
await page.getByRole("button", { name: "чт", exact: true }).click();
await page.getByRole("button", { name: "60 мин" }).click();
await shot("04-training");
await nextButton.click();

await page.getByRole("button", { name: "Сладкое" }).click();
await page.getByRole("button", { name: "Прогулки" }).click();
await shot("05-habits");
await nextButton.click();

await shot("06-sleep");
await nextButton.click();

await page.getByRole("button", { name: "Креатин" }).click();
await page.getByLabel("Добавить свою добавку").fill("Железо");
await page.getByRole("button", { name: "Добавить", exact: true }).click();
await shot("07-supplements");
await page.getByRole("button", { name: "Готово" }).click();

await page.getByRole("heading", { name: "Всё готово!" }).waitFor({ timeout: 15000 });
await shot("08-done");
console.log("--- ИТОГ ОПРОСА ---\n" + (await page.locator(".onboarding__body").innerText()).split("\n").filter(Boolean).join(" | "));
await page.getByRole("button", { name: "Поехали" }).click();

await page.waitForSelector(".tabbar", { timeout: 15000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${dir}/onboarding-09-today.png`, fullPage: true });
const today = await page.locator(".app__main").innerText();
console.log("--- СЕГОДНЯ ---\n" + today.split("\n").filter(Boolean).slice(0, 30).join(" | "));
console.log("привычки на главном:", today.includes("Без сладкого") && today.includes("Прогулка 30 минут"));

// После перезагрузки опрос не возвращается.
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".tabbar", { timeout: 15000 });
console.log("опрос после перезагрузки не показан:", (await page.locator(".onboarding").count()) === 0);

console.log("ошибки в консоли:", errors.length ? errors : "нет");
await browser.close();
if (errors.length) process.exit(1);
