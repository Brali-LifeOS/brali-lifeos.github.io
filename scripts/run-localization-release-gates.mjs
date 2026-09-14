import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const profile = JSON.parse(await readFile(".arwp/localization.json", "utf8"));
const mode = process.argv[2] || "all";
const requested = process.env.LOCALIZATION_LOCALE?.trim();
const eligible = (profile.locales || []).filter((locale) =>
  locale.role === "human-interface" && locale.status !== "draft" && (!requested || locale.code === requested),
);

if (!eligible.length) {
  throw new Error(`[localization-release] no eligible human-interface locales${requested ? ` for ${requested}` : ""}`);
}

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
      else reject(new Error(`[localization-release] ${script} failed for ${locale.code}: code=${code} signal=${signal || "none"}`));
    });
  });
}

for (const locale of eligible) {
  console.log(`[localization-release] ${locale.code}: status=${locale.status}; mode=${mode}`);
  if (mode === "live" || mode === "all") await run("scripts/check-live-localizations.mjs", locale);
  if (mode === "browser" || mode === "all") await run("scripts/check-browser-localizations.mjs", locale);
}

console.log(`[localization-release] passed for ${eligible.map((locale) => locale.code).join(", ")}`);
