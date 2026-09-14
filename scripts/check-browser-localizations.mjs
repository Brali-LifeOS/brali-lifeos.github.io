import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const base = (process.env.LOCALIZATION_LIVE_BASE || "https://brali-lifeos.github.io").replace(/\/$/, "");
const artifactRoot = path.join(root, "artifacts", "localization-browser");
const manifest = JSON.parse(await readFile(path.join(root, "ru", "manifest.json"), "utf8"));
const failures = [];
const allRoutes = [...new Set((manifest.routes || []).map((route) => route.path).filter((route) => route?.startsWith("/ru/")))];
if (!allRoutes.length) throw new Error("[localization-browser] ru/manifest.json contains no Russian browser routes");

await mkdir(artifactRoot, { recursive: true });

function fail(route, check, detail = "") {
  failures.push(`${route} :: ${check}${detail ? ` :: ${detail}` : ""}`);
}

async function inspectPage(page, route, viewport, { keyboard = false, screenshot = false } = {}) {
  await page.setViewportSize(viewport);
  const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!response || response.status() !== 200) {
    fail(route, "HTTP 200", response ? `status=${response.status()}` : "no response");
    return;
  }
  await page.waitForTimeout(120);

  const result = await page.evaluate(() => {
    const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
    const ruAlt = document.querySelector('link[rel="alternate"][hreflang="ru"]')?.href || "";
    const enAlt = document.querySelector('link[rel="alternate"][hreflang="en"]')?.href || "";
    const h1 = document.querySelector("h1");
    const body = document.body?.innerText || "";
    const overflow = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) - window.innerWidth;
    const englishShell = [...document.querySelectorAll("a,button,[aria-label]")]
      .map((element) => `${element.textContent || ""} ${element.getAttribute("aria-label") || ""}`.trim())
      .filter((value) => /\b(?:Skip to content|Main navigation|Explore)\b/i.test(value));
    return {
      lang: document.documentElement.lang,
      canonical,
      ruAlt,
      enAlt,
      h1Text: h1?.textContent?.trim() || "",
      h1Visible: Boolean(h1 && h1.getClientRects().length),
      hasCyrillic: /[А-Яа-яЁё]/.test(body),
      overflow,
      englishShell,
    };
  });

  if (result.lang !== "ru") fail(route, "html lang=ru", `got=${JSON.stringify(result.lang)}`);
  if (!result.canonical.startsWith(base) || !result.canonical.includes("/ru/")) fail(route, "self Russian canonical", result.canonical);
  if (!result.ruAlt.startsWith(base) || !result.ruAlt.includes("/ru/")) fail(route, "ru hreflang", result.ruAlt);
  if (!result.enAlt.startsWith(base)) fail(route, "en hreflang", result.enAlt);
  if (!result.h1Visible || !result.h1Text) fail(route, "visible H1", result.h1Text);
  if (!result.hasCyrillic) fail(route, "rendered Cyrillic body");
  if (viewport.width === 320 && result.overflow > 2) fail(route, "320px horizontal overflow", `${result.overflow}px`);
  if (result.englishShell.length) fail(route, "English shell leakage", result.englishShell.slice(0, 3).join(" | "));

  if (keyboard) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active || active === document.body || active === document.documentElement) return null;
      return {
        tag: active.tagName,
        text: active.textContent?.trim().slice(0, 120) || "",
        aria: active.getAttribute("aria-label") || "",
      };
    });
    if (!focus) fail(route, "keyboard focus after Tab");
    if (focus && /\b(?:Skip to content|Main navigation|Explore)\b/i.test(`${focus.text} ${focus.aria}`)) fail(route, "localized keyboard/accessibility label", `${focus.text} ${focus.aria}`);
  }

  if (screenshot) {
    const slug = route.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9-]+/gi, "-") || "ru-home";
    await page.screenshot({ path: path.join(artifactRoot, `${slug}-${viewport.width}.png`), fullPage: true });
    const aria = await page.locator("body").ariaSnapshot().catch(() => "");
    await writeFile(path.join(artifactRoot, `${slug}-${viewport.width}.aria.txt`), aria || "", "utf8");
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: "ru-RU", colorScheme: "light" });
  const page = await context.newPage();

  for (const route of allRoutes) {
    try {
      await inspectPage(page, route, { width: 320, height: 800 });
    } catch (error) {
      fail(route, "browser execution", error?.message || String(error));
    }
  }

  const preferred = [
    "/ru/",
    "/ru/life-os/",
    "/ru/life-os/methodology/",
    "/ru/research/",
    "/ru/partners/",
    "/ru/for-ai/",
    "/ru/life-os/implementation-intentions/",
    "/ru/life-os/box-breathing/",
    "/ru/life-os/cognitive-restructuring/",
  ];
  const corpusRoutes = allRoutes.filter((route) => /^\/ru\/life-os\/[^/]+\/$/.test(route));
  for (const index of [0, Math.floor(corpusRoutes.length / 2), Math.max(0, corpusRoutes.length - 1)]) {
    if (corpusRoutes[index]) preferred.push(corpusRoutes[index]);
  }
  const representatives = [...new Set(preferred.filter((route) => allRoutes.includes(route)))];
  for (const route of representatives) {
    for (const viewport of [{ width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
      try {
        await inspectPage(page, route, viewport, { keyboard: true, screenshot: true });
      } catch (error) {
        fail(route, `representative browser ${viewport.width}`, error?.message || String(error));
      }
    }
  }

  await context.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`[localization-browser] failed with ${failures.length} browser findings:`);
  for (const item of failures.slice(0, 100)) console.error(`  ${item}`);
  if (failures.length > 100) console.error(`  ... ${failures.length - 100} more`);
  process.exitCode = 1;
} else {
  console.log(`Real-browser Russian localization gate passed: ${allRoutes.length} routes at 320px; representative desktop/tablet, keyboard and ARIA snapshots captured.`);
}
