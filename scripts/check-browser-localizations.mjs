import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const profile = JSON.parse(await readFile(path.join(root, ".arwp", "localization.json"), "utf8"));
const localeCode = process.env.LOCALIZATION_LOCALE || profile.releaseContract?.referenceImplementation;
const locale = (profile.locales || []).find((entry) => entry.code === localeCode);
if (!locale || locale.role !== "human-interface") throw new Error(`[localization-browser] unknown human-interface locale ${localeCode}`);

const sourceLocale = profile.sourceLocale;
const base = (process.env.LOCALIZATION_LIVE_BASE || profile.site || "https://brali-lifeos.github.io/").replace(/\/$/, "");
const languageTag = process.env.LOCALIZATION_LANGUAGE_TAG || locale.languageTag;
const browserLocale = process.env.LOCALIZATION_BROWSER_LOCALE || locale.browserLocale || languageTag;
const routePrefix = locale.routePrefix;
const manifestUrl = process.env.LOCALIZATION_MANIFEST_URL || `${base}${routePrefix}manifest.json`;
const artifactRoot = path.join(root, "artifacts", "localization-browser", localeCode);
const failures = [];

const manifestResponse = await fetch(manifestUrl, {
  headers: { "user-agent": "Brali-localization-browser-gate/2.0" },
  redirect: "follow",
});
if (!manifestResponse.ok) throw new Error(`[localization-browser] cannot load deployed manifest ${manifestUrl}: HTTP ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
if (manifest.locale !== localeCode) throw new Error(`[localization-browser] manifest locale ${manifest.locale} does not match registry locale ${localeCode}`);
const allRoutes = [...new Set((manifest.routes || []).map((route) => route.path).filter((route) => route?.startsWith(routePrefix)))];
if (!allRoutes.length) throw new Error(`[localization-browser] deployed ${manifestUrl} contains no ${localeCode} browser routes`);

await mkdir(artifactRoot, { recursive: true });

function fail(route, check, detail = "") {
  failures.push(`${route} :: ${check}${detail ? ` :: ${detail}` : ""}`);
}

function artifactSlug(route) {
  return route.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9-]+/gi, "-") || `${localeCode}-home`;
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
    const overflowers = overflow > 2
      ? [...document.querySelectorAll("body *")]
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            const visibleInternalOverflow = element.scrollWidth > element.clientWidth + 2
              && !["auto", "scroll", "hidden", "clip"].includes(style.overflowX);
            const escapesViewport = rect.right > window.innerWidth + 2 || rect.left < -2 || rect.width > window.innerWidth + 2;
            if (!visibleInternalOverflow && !escapesViewport) return null;
            return {
              tag: element.tagName.toLowerCase(),
              className: typeof element.className === "string" ? element.className.slice(0, 80) : "",
              text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100),
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              overflowX: style.overflowX,
            };
          })
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const shellText = [...document.querySelectorAll("a,button,[aria-label],#brali-analytics-consent")]
      .map((element) => `${element.textContent || ""} ${element.getAttribute("aria-label") || ""}`.replace(/\s+/g, " ").trim())
      .filter((value) => /\b(?:Skip to content|Main navigation|Explore|Analytics preference|Optional analytics|Allow analytics|Necessary only)\b/i.test(value));
    return {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir || "ltr",
      canonical,
      alternates,
      h1Text: h1?.textContent?.trim() || "",
      h1Visible: Boolean(h1 && h1.getClientRects().length),
      hasCyrillic: /[А-Яа-яЁё]/.test(body),
      overflow,
      overflowers,
      shellText,
    };
  });

  const localeAlt = result.alternates[languageTag] || "";
  const sourceAlt = result.alternates[sourceLocale] || "";
  if (result.lang !== languageTag) fail(route, `html lang=${languageTag}`, `got=${JSON.stringify(result.lang)}`);
  if (result.dir !== (locale.direction || "ltr")) fail(route, `html dir=${locale.direction || "ltr"}`, `got=${JSON.stringify(result.dir)}`);
  if (!result.canonical.startsWith(base) || !result.canonical.includes(routePrefix)) fail(route, `self ${localeCode} canonical`, result.canonical);
  if (!localeAlt.startsWith(base) || !localeAlt.includes(routePrefix)) fail(route, `${languageTag} hreflang`, localeAlt);
  if (!sourceAlt.startsWith(base)) fail(route, `${sourceLocale} hreflang`, sourceAlt);
  if (!result.h1Visible || !result.h1Text) fail(route, "visible H1", result.h1Text);
  if (localeCode === "ru" && !result.hasCyrillic) fail(route, "rendered Cyrillic body");
  if (viewport.width === 320 && result.overflow > 2) {
    fail(route, "320px horizontal overflow", `${result.overflow}px; offenders=${JSON.stringify(result.overflowers)}`);
    await page.screenshot({ path: path.join(artifactRoot, `${artifactSlug(route)}-320-failure.png`), fullPage: true });
  }
  if (localeCode !== sourceLocale && result.shellText.length) fail(route, "source-language shell leakage", result.shellText.slice(0, 3).join(" | "));

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
    if (localeCode !== sourceLocale && focus && /\b(?:Skip to content|Main navigation|Explore|Analytics preference|Optional analytics|Allow analytics|Necessary only)\b/i.test(`${focus.text} ${focus.aria}`)) {
      fail(route, "localized keyboard/accessibility label", `${focus.text} ${focus.aria}`);
    }
  }

  if (screenshot) {
    const slug = artifactSlug(route);
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
  for (const index of [0, Math.floor(corpusRoutes.length / 2), Math.max(0, corpusRoutes.length - 1)]) if (corpusRoutes[index]) preferred.push(corpusRoutes[index]);
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
  console.log(`Real-browser ${localeCode} localization gate passed from deployed manifest ${manifestUrl}: ${allRoutes.length} routes at 320px; representative desktop/tablet, keyboard and ARIA snapshots captured.`);
}
