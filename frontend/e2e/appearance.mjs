/**
 * Проверка стеклянного интерфейса.
 *
 * Три вещи, которые на translucent-интерфейсе ломаются первыми:
 *   1. читаемость текста поверх подвижного фона,
 *   2. плавность прокрутки — backdrop-filter стоит дорого,
 *   3. запасной вариант, когда стекло выключено.
 *
 * Скриншоты областей кладутся в e2e/screenshots — контраст по фактическим
 * пикселям считается отдельно (см. scripts/contrast.py).
 */
import { chromium } from "playwright";

const EXEC = process.env.CHROMIUM_PATH || undefined;
const BASE = process.env.APP_URL ?? "http://127.0.0.1:5173";
const dir = process.env.SHOT_DIR || "./e2e/screenshots";

const browser = await chromium.launch({
  ...(EXEC ? { executablePath: EXEC } : {}),
  args: ["--no-sandbox"],
});

async function session(colorScheme) {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme,
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByLabel(/Ник, email или телефон/).fill("demo_user");
  await page.getByLabel("Пароль").fill("demo12345");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForSelector(".tabbar");
  await page.waitForTimeout(2500);
  return { context, page };
}

const countBlur = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("*")].filter((el) => {
        const style = getComputedStyle(el);
        const filter = style.backdropFilter || style.webkitBackdropFilter;
        return filter && filter !== "none" && !filter.startsWith("blur(0px)");
      }).length,
  );

/** Прокрутка под нагрузкой: считаем длительность кадров. */
async function scrollFrames(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        const tick = (now) => {
          times.push(now - last);
          last = now;
          if (times.length < 90) requestAnimationFrame(tick);
          else resolve(times);
        };
        requestAnimationFrame(tick);
        let y = 0;
        const step = () => {
          y += 14;
          window.scrollTo(0, y);
          if (y < 1200) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
}

for (const scheme of ["light", "dark"]) {
  const { context, page } = await session(scheme);
  console.log(`\n=== ${scheme} ===`);
  console.log("элементов, размывающих фон:", await countBlur(page));

  // Прокручиваем, чтобы под шапкой и таб-баром оказался контент:
  // это худший случай для читаемости.
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(1000);
  for (const [selector, name] of [
    [".tabbar", "tabbar"],
    [".app__header", "header"],
    [".card", "card"],
  ]) {
    await page.locator(selector).first().screenshot({
      path: `${dir}/contrast-${scheme}-${name}.png`,
    });
  }
  console.log("области для замера контраста сняты");

  // Медленный телефон: примерно вчетверо медленнее десктопа.
  const client = await context.newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);

  const withGlass = await scrollFrames(page);
  await page.evaluate(() => document.documentElement.setAttribute("data-surface", "solid"));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  const withoutGlass = await scrollFrames(page);

  const report = (label, frames) => {
    const sorted = [...frames].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const janky = frames.filter((f) => f > 22).length;
    console.log(
      `${label}: медиана ${p50.toFixed(1)} мс (${(1000 / p50).toFixed(0)} fps), ` +
        `кадров дольше 22 мс: ${janky} из ${frames.length}`,
    );
  };
  report("прокрутка со стеклом", withGlass);
  report("прокрутка без стекла", withoutGlass);

  await page.screenshot({ path: `${dir}/appearance-${scheme}-solid.png`, fullPage: true });
  await context.close();
}

await browser.close();
