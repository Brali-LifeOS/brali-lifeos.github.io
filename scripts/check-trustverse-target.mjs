import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const target = Number(process.env.TRUSTVERSE_TARGET || 900);
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const library = JSON.parse(await readFile(path.join(root, "skill-packs/library.json"), "utf8"));
const catalog = JSON.parse(await readFile(path.join(root, "skill-packs/catalog.json"), "utf8"));
const trustedStates = new Set(["reviewed", "practical"]);
const trusted = (evidence.entries ?? []).filter((entry) => trustedStates.has(entry.status) && entry.indexable === true);
const practical = trusted.filter((entry) => entry.status === "practical");
const reviewed = trusted.filter((entry) => entry.status === "reviewed");
const pending = (evidence.entries ?? []).filter((entry) => entry.status === "pending-review");
const restricted = (evidence.entries ?? []).filter((entry) => entry.status === "restricted");
const unsafePractical = practical.filter((entry) => entry.sensitive === true || entry.claims?.evidenceLanguage || (entry.claims?.enforcedCategories ?? []).length > 0);
const usable = library.counts_by_mode?.usable ?? 0;

const summary = `Trustverse coverage: trusted=${trusted.length}/${evidence.entries?.length ?? 0} (practical=${practical.length}, reviewed=${reviewed.length}), usable-skills=${usable}, pending=${pending.length}, restricted=${restricted.length}, target=${target}.`;
console.log(summary);

if (unsafePractical.length) {
  throw new Error(`Trustverse target gate rejected ${unsafePractical.length} practical record(s) that still carry a sensitive flag or enforced/evidence-like claim: ${unsafePractical.slice(0, 20).map((entry) => entry.slug).join(", ")}`);
}
if (usable !== trusted.length) {
  throw new Error(`Trustverse/Agent Skill parity failed: trusted=${trusted.length}, usable-skills=${usable}.`);
}
if (catalog.count !== trusted.length) {
  throw new Error(`Trustverse trusted catalog parity failed: trusted=${trusted.length}, catalog=${catalog.count}.`);
}
if (trusted.length < target) {
  throw new Error(`${summary} Coverage remains ${target - trusted.length} below the required target.`);
}
