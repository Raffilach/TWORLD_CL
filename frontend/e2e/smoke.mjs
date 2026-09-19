import { chromium } from "playwright";

const EXEC = process.env.CHROMIUM_PATH || undefined;
const BASE = process.env.APP_URL ?? "http://127.0.0.1:5174";
const errors = [];
const dir = process.env.SHOT_DIR || "./e2e/screenshots";

const browser = await chromium.launch({
  ...(EXEC ? { executablePath: EXEC } : {}),
  args: ["--no-sandbox"],
});
// iPhone 14 Pro: 393×852, ровно тот случай, под который делается приложение.
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

async function shot(name) {
  await page.screenshot({ path: `${dir}/shot-${name}.png`, fullPage: true });
}

await page.goto(BASE, { waitUntil: "networkidle" });
await shot("01-login");

// вход демо-пользователем
await page.getByLabel(/Ник, email или телефон/).fill("demo_user");
await page.getByLabel("Пароль").fill("demo12345");
await page.getByRole("button", { name: "Войти" }).click();
await page.waitForSelector(".tabbar", { timeout: 15000 });
await page.waitForTimeout(1500);
await shot("02-today");

const todayText = await page.locator(".app__main").innerText();
console.log("--- СЕГОДНЯ ---\n" + todayText.slice(0, 900));

// проверка требований iOS: размер шрифта в полях и тап-зоны
const audit = await page.evaluate(() => {
  const smallInputs = [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
    .map((el) => el.getAttribute("aria-label") || el.type || el.tagName);
  const smallTaps = [...document.querySelectorAll("button, a")]
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
    })
    .map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30));
  const horizontalScroll =
    document.documentElement.scrollWidth > document.documentElement.clientWidth;
  return { smallInputs, smallTaps, horizontalScroll };
});
console.log("--- АУДИТ iOS ---");
console.log("поля меньше 16px:", audit.smallInputs);
console.log("тап-зоны меньше 44px:", audit.smallTaps.slice(0, 10), "всего:", audit.smallTaps.length);
console.log("горизонтальный скролл:", audit.horizontalScroll);

for (const [name, tab] of [
  ["03-training", "Тренировки"],
  ["04-progress", "Прогресс"],
  ["05-friends", "Друзья"],
  ["06-profile", "Профиль"],
]) {
  await page.getByRole("link", { name: tab }).click();
  await page.waitForTimeout(1800);
  await shot(name);
  console.log(`--- ${tab.toUpperCase()} ---\n` + (await page.locator(".app__main").innerText()).slice(0, 500));
}

console.log("\n--- ОШИБКИ В КОНСОЛИ ---");
console.log(errors.length ? errors.join("\n") : "нет");

await browser.close();
