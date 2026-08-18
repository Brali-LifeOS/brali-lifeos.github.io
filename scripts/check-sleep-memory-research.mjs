import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const decisions = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence-decisions.json"), "utf8"));
const candidates = JSON.parse(await readFile(path.join(root, "data/research-candidates.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const protocols = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const sleepNote = await readFile(path.join(root, "research/sleep-regularity-signal-not-prescription/index.html"), "utf8");
const memoryPage = await readFile(path.join(root, "life-os/avoid-list-interference-memory-retention/index.html"), "utf8");
const memoryTopic = await readFile(path.join(root, "ontology/topics/memory/index.html"), "utf8");
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");

const failures = [];
const byCandidate = new Map((candidates.candidates ?? []).map((item) => [item.id, item]));
const byDecision = new Map((decisions.entries ?? []).map((item) => [item.id, item]));
const evidenceBySlug = new Map((evidence.entries ?? []).map((item) => [item.slug, item]));
const protocolBySlug = new Map((protocols.entries ?? []).map((item) => [item.slug, item]));

if (decisions.count !== (decisions.entries ?? []).length) failures.push("published evidence decision count does not match entries");
const wakeDecision = byDecision.get("wakeful-rest-memory-2026");
const sleepDecision = byDecision.get("sleep-variability-cognition-2026");
if (wakeDecision?.decision !== "propose-protocol" || wakeDecision?.source_reviewed !== true) failures.push("wakeful-rest evidence decision is missing or not reviewed/propose-protocol");
if (sleepDecision?.decision !== "watch" || sleepDecision?.source_reviewed !== true) failures.push("sleep-variability evidence decision is missing or not reviewed/watch");
if (!wakeDecision?.limitations?.length || !sleepDecision?.limitations?.length) failures.push("sleep/memory evidence decisions must preserve limitations");
if (byCandidate.get("crossref:10.3758/s13423-025-02778-3")?.status !== "propose-protocol") failures.push("wakeful-rest candidate workflow status is not propose-protocol");
if (byCandidate.get("crossref:10.1016/j.jad.2025.120481")?.status !== "watch") failures.push("sleep-variability candidate workflow status is not watch");

const memoryEvidence = evidenceBySlug.get("avoid-list-interference-memory-retention");
if (memoryEvidence?.status !== "reviewed") failures.push("wakeful-rest memory protocol is not reviewed");
if (!memoryEvidence?.ontology?.topics?.some((item) => item.id === "memory")) failures.push("wakeful-rest memory protocol is not classified as Memory");
const memoryProtocol = protocolBySlug.get("avoid-list-interference-memory-retention");
if (!memoryProtocol) failures.push("wakeful-rest memory protocol is missing from Trusted Protocol Feed");
if (!memoryProtocol?.ontology?.topics?.some((item) => item.id === "memory")) failures.push("Trusted Protocol Feed lost the Memory classification");
if (!memoryProtocol?.evidence?.source_url?.includes("10.3758/s13423-025-02778-3")) failures.push("Trusted Protocol Feed does not expose the reviewed wakeful-rest source");

for (const required of ["Try Quiet Wakeful Rest After Learning", "<h2>Sources</h2>", "10.3758/s13423-025-02778-3", "Do not turn ten minutes into a magic dose"]) {
  if (!memoryPage.includes(required)) failures.push(`public memory protocol missing: ${required}`);
}
for (const forbidden of ["pause for 3 seconds", "verbally review the last 3 items", "Research shows habits can take 21-66 days to form", "metalhatscats.com"]) {
  if (memoryPage.toLowerCase().includes(forbidden.toLowerCase())) failures.push(`old unsupported memory fragment leaked into public page: ${forbidden}`);
}
if (!memoryTopic.includes('/life-os/avoid-list-interference-memory-retention/')) failures.push("Memory Topic page does not include the reviewed wakeful-rest protocol");

for (const required of ["Sleep regularity is a signal, not yet a prescription", "<h2>Sources</h2>", "10.1016/j.jad.2025.120481", "does not establish that irregular sleep causes cognitive decline", "Status: <strong>watch</strong>"]) {
  if (!sleepNote.includes(required)) failures.push(`sleep evidence note missing: ${required}`);
}
if (!sitemap.includes("https://brali-lifeos.github.io/research/sleep-regularity-signal-not-prescription/")) failures.push("sleep evidence note is missing from sitemap");

if (failures.length) throw new Error(`Sleep/memory research validation failed with ${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
console.log(`Sleep/memory research verified within ${decisions.count} published evidence decisions: wakeful-rest protocol reviewed and trusted, sleep variability retained as watch.`);
