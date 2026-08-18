import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const decisions = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence-decisions.json"), "utf8"));
const candidates = JSON.parse(await readFile(path.join(root, "data/research-candidates.json"), "utf8"));
const protocols = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const note = await readFile(path.join(root, "research/movement-breaks-no-magic-interval/index.html"), "utf8");
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");

const failures = [];
const decision = (decisions.entries ?? []).find((item) => item.id === "movement-breaks-cognition-2026");
const candidate = (candidates.candidates ?? []).find((item) => item.id === "crossref:10.1186/s12966-026-01953-6");
if (decision?.decision !== "watch" || decision?.source_reviewed !== true) failures.push("movement-break evidence decision is missing or not reviewed/watch");
if (!decision?.limitations?.length || !decision?.unsupported_or_overstated_claims?.length) failures.push("movement-break decision lost limitations or unsupported-claim boundaries");
if (candidate?.status !== "watch") failures.push("movement-break research candidate is not watch");
if ((protocols.entries ?? []).some((item) => item.evidence?.source_url?.includes("10.1186/s12966-026-01953-6"))) failures.push("movement-break watch source was incorrectly promoted into Trusted Protocol Feed");
for (const required of ["Movement breaks: useful signal, no magic interval", "21 randomized crossover trials", "433 participants", "<h2>Sources</h2>", "10.1186/s12966-026-01953-6", "Status: <strong>watch</strong>"]) {
  if (!note.includes(required)) failures.push(`movement-break note missing: ${required}`);
}
for (const forbidden of ["every 30 minutes for better cognition", "proven to optimize cognition", "optimal break interval is"]) {
  if (note.toLowerCase().includes(forbidden.toLowerCase())) failures.push(`movement-break note overstates prescription: ${forbidden}`);
}
if (!sitemap.includes("https://brali-lifeos.github.io/research/movement-breaks-no-magic-interval/")) failures.push("movement-break note is missing from sitemap");

if (failures.length) throw new Error(`Movement-break research validation failed with ${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
console.log("Movement-break evidence boundary verified: reviewed watch decision, no protocol promotion, no magic interval claim.");
