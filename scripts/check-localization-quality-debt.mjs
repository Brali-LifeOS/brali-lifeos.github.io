import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const profile = await readJson(".arwp/localization.json");
if (!profile.debtLedger) throw new Error("[localization-debt] profile.debtLedger is required");
const document = await readJson(profile.debtLedger);
const allowedStates = new Set(["planned", "open", "closed"]);

function ledgerFor(locale) {
  if (document?.locales && typeof document.locales === "object") {
    const ledger = document.locales[locale.code];
    return ledger ? { ...ledger, locale: locale.code } : null;
  }
  // Backward compatibility for the original single-locale ledger shape.
  return document?.locale === locale.code ? document : null;
}

const failures = [];
for (const locale of profile.locales || []) {
  if (locale.role !== "human-interface" || locale.status === "draft") continue;

  const ledger = ledgerFor(locale);
  if (!ledger) {
    failures.push(`${locale.code}: ${locale.status} locale has no entry in ${profile.debtLedger}`);
    continue;
  }
  if (ledger.status !== locale.status) failures.push(`${locale.code}: debt status ${ledger.status} != registry status ${locale.status}`);
  if (!Array.isArray(ledger.items)) {
    failures.push(`${locale.code}: quality-debt items must be an array`);
    continue;
  }

  const ids = new Set();
  let active = 0;
  for (const item of ledger.items) {
    if (!item?.id || typeof item.id !== "string") failures.push(`${locale.code}: debt item without stable id`);
    else if (ids.has(item.id)) failures.push(`${locale.code}: duplicate debt id ${item.id}`);
    else ids.add(item.id);

    if (!allowedStates.has(item?.state)) failures.push(`${locale.code}/${item?.id || "<missing-id>"}: invalid state ${item?.state}`);
    if (typeof item?.release_blocking !== "boolean") failures.push(`${locale.code}/${item?.id || "<missing-id>"}: release_blocking must be boolean`);
    if (item?.state !== "closed") active += 1;
    if (locale.status === "published" && item?.release_blocking === true && item?.state !== "closed") {
      failures.push(`${locale.code}/${item.id}: published locale cannot retain release-blocking debt`);
    }
  }

  if (locale.status === "reviewed-partial" && active === 0) {
    failures.push(`${locale.code}: reviewed-partial status has no active debt; record the remaining boundary or promote only after release proof is complete`);
  }

  console.log(`[localization-debt] ${locale.code}: ${ledger.items.length} item(s), ${active} active, source=${profile.debtLedger}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`  ${failure}`);
  throw new Error(`[localization-debt] ${failures.length} quality-debt contract failure(s)`);
}

console.log("Localization quality-debt contract passed for every non-draft human-interface locale.");
