import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const profile = JSON.parse(await readFile(".arwp/localization.json", "utf8"));
const mode = process.argv[2] || "all";
if (!["live", "browser", "all"].includes(mode)) throw new Error(`[localization-release] unsupported mode ${mode}`);

const requested = process.env.LOCALIZATION_LOCALE?.trim();
const locales = (profile.locales || []).filter((locale) =>
  locale.role === "human-interface"
  && ["reviewed-partial", "published"].includes(locale.status)
  && (!requested || locale.code === requested),
);
if (!locales.length) throw new Error(`[localization-release] no release-state human-interface locales${requested ? ` for ${requested}` : ""}`);

function run(script, locale) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: {
        ...process.env,
        LOCALIZATION_LOCALE: locale.code,
        LOCALIZATION_LANGUAGE_TAG: locale.languageTag,
        LOCALIZATION_BROWSER_LOCALE: locale.browserLocale || locale.languageTag,
      },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`[localization-release] ${script} failed for ${locale.code}: code=${code}; signal=${signal || "none"}`));
    });
  });
}

for (const locale of locales) {
  console.log(`[localization-release] ${locale.code}: status=${locale.status}; search=${locale.searchPublication}; mode=${mode}`);
  if (mode === "live" || mode === "all") await run("scripts/check-live-localizations.mjs", locale);
  if (mode === "browser" || mode === "all") await run("scripts/check-browser-localizations.mjs", locale);
}

console.log(`[localization-release] ${mode} gates passed for ${locales.map((locale) => locale.code).join(", ")}`);
