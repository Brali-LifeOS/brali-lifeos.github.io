import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const base = (process.env.LOCALIZATION_LIVE_BASE || "https://brali-lifeos.github.io").replace(/\/$/, "");
const locale = process.env.LOCALIZATION_LOCALE || "ru";
const languageTag = process.env.LOCALIZATION_LANGUAGE_TAG || locale;
const browserLocale = process.env.LOCALIZATION_BROWSER_LOCALE || (locale === "ru" ? "ru-RU" : languageTag);
const routePrefix = `/${locale}/`;
const manifestUrl = process.env.LOCALIZATION_MANIFEST_URL || `${base}${routePrefix}manifest.json`;
const artifactRoot = path.join(root, "artifacts", "localization-browser", locale);
const failures = [];

const manifestResponse = await fetch(manifestUrl, {
  headers: { "user-agent": "Brali-localization-browser-gate/1.0" },
  redirect: "follow",
});
if (!manifestResponse.ok) {
  throw new Error(`[localization-browser] cannot load deployed manifest ${manifestUrl}: HTTP ${manifestResponse.status}`);
}
const manifest = await manifestResponse.json();
const allRoutes = [...new Set((manifest.routes || []).map((route) => route.path).filter((route) => route?.startsWith(routePrefix)))];
if (!allRoutes.length) throw new Error(`[localization-browser] deployed ${manifestUrl} contains no ${locale} browser routes`);

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
    const alternates = Object.fromEntries(
      [...document.querySelectorAll('link[rel="alternate"][hreflang]')]
        .map((node) => [node.getAttribute("hreflang"), node.href])
        .filter(([lang, href]) => lang && href),
    );
    const h1 = document.querySelector("h1");
    const body = document.body?.innerText || "";
    const overflow = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) - window.innerWidth;
    const englishShell = [...document.querySelectorAll("a,button,[aria-label]")]
      .map((element) => `${element.textContent || ""} ${element.getAttribute("aria-label") || ""}`.trim())
      .filter((value) => /\b(?:Skip to content|Main navigation|Explore)\b/i.test(value));
    return {
      lang: document.documentElement.lang,
      canonical,
      alternates,
      h1Text: h1?.textContent?.trim() || "",
      h1Visible: Boolean(h1 && h1.getClientRects().length),
      hasCyrillic: /[А-Яа-яЁё]/.test(body),
      overflow,
      englishShell,
    };
  });

  const localeAlt = result.alternates[languageTag] || "";
  const enAlt = result.alternates.en || "";
  if (result.lang !== languageTag) fail(route, `html lang=${languageTag}`, `got=${JSON.stringify(result.lang)}`);
  if (!result.canonical.startsWith(base) || !result.canonical.includes(routePrefix)) fail(route, `self ${locale} canonical`, result.canonical);
  if (!localeAlt.startsWith(base) || !localeAlt.includes(routePrefix)) fail(route, `${languageTag} hreflang`, localeAlt);
  if (!enAlt.startsWith(base)) fail(route, "en hreflang", enAlt);
  if (!result.h1Visible || !result.h1Text) fail(route, "visible H1", result.h1Text);
  if (locale === "ru" && !result.hasCyrillic) fail(route, "rendered Cyrillic body");
  if (viewport.width === 320 && result.overflow > 2) fail(route, "320px horizontal overflow", `${result.overflow}px`);
  if (locale === "ru" && result.englishShell.length) fail(route, "English shell leakage", result.englishShell.slice(0, 3).join(" | "));

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
    if (locale === "ru" && focus && /\b(?:Skip to content|Main navigation|Explore)\b/i.test(`${focus.text} ${focus.aria}`)) {
      fail(route, "localized keyboard/accessibility label", `${focus.text} ${focus.aria}`);
    }
  }

  if (screenshot) {
    const slug = route.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9-]+/gi, "-") || `${locale}-home`;
    await page.screenshot({ path: path.join(artifactRoot, `${slug}-${viewport.width}.png`), fullPage: true });
    const aria = await page.locator("body").ariaSnapshot().catch(() => "");
    await writeFile(path.join(artifactRoot, `${slug}-${viewport.width}.aria.txt`), aria || "", "utf8");
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: browserLocale, colorScheme: "light" });
  const page = await context.newPage();

  for (const route of allRoutes) {
    try {
      await inspectPage(page, route, { width: 320, height: 800 });
    } catch (error) {
      fail(route, "browser execution", error?.message || String(error));
    }
  }

  const preferred = [
    routePrefix,
    `${routePrefix}life-os/`,
    `${routePrefix}life-os/methodology/`,
    `${routePrefix}research/`,
    `${routePrefix}partners/`,
    `${routePrefix}for-ai/`,
    `${routePrefix}life-os/implementation-intentions/`,
    `${routePrefix}life-os/box-breathing/`,
    `${routePrefix}life-os/cognitive-restructuring/`,
  ];
  const corpusRoutes = allRoutes.filter((route) => route.startsWith(`${routePrefix}life-os/`) && route.split("/").filter(Boolean).length === 3);
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
  console.log(`Real-browser ${locale} localization gate passed from deployed manifest ${manifestUrl}: ${allRoutes.length} routes at 320px; representative desktop/tablet, keyboard and ARIA snapshots captured.`);
}
