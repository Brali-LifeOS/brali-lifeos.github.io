import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const decisions = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence-decisions.json"), "utf8"));
const candidates = JSON.parse(await readFile(path.join(root, "data/research-candidates.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const protocols = JSON.parse(await readFile(path.join(root, "life-os/datasets/protocols.json"), "utf8"));
const page = await readFile(path.join(root, "life-os/active-recall-test-yourself/index.html"), "utf8");
const note = await readFile(path.join(root, "research/retrieval-practice-memory-is-not-application/index.html"), "utf8");
const memoryTopic = await readFile(path.join(root, "ontology/topics/memory/index.html"), "utf8");
const skillTopic = await readFile(path.join(root, "ontology/topics/skill-learning/index.html"), "utf8");
const methodPage = await readFile(path.join(root, "ontology/methods/retrieval-practice/index.html"), "utf8");
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");

const failures = [];
const decisionById = new Map((decisions.entries ?? []).map((item) => [item.id, item]));
const candidateById = new Map((candidates.candidates ?? []).map((item) => [item.id, item]));
const evidenceBySlug = new Map((evidence.entries ?? []).map((item) => [item.slug, item]));
const protocolBySlug = new Map((protocols.entries ?? []).map((item) => [item.slug, item]));

for (const id of ["testing-effect-direct-forward-2026", "retrieval-procedural-application-2026"]) {
  const decision = decisionById.get(id);
  if (decision?.decision !== "challenge-existing" || decision?.source_reviewed !== true) failures.push(`${id} is missing reviewed challenge-existing decision`);
  if (!decision?.limitations?.length || !decision?.supported_claim) failures.push(`${id} lost claim scope or limitations`);
}
if (candidateById.get("crossref:10.1037/xlm0001634")?.status !== "challenge-existing") failures.push("testing-effect candidate status is not challenge-existing");
if (candidateById.get("crossref:10.1016/j.learninstruc.2026.102377")?.status !== "challenge-existing") failures.push("procedural retrieval candidate status is not challenge-existing");

const trust = evidenceBySlug.get("active-recall-test-yourself");
if (trust?.status !== "reviewed") failures.push("active-recall protocol is not reviewed");
for (const topic of ["memory", "skill-learning"]) if (!trust?.ontology?.topics?.some((item) => item.id === topic)) failures.push(`active-recall protocol missing Topic ${topic}`);
if (!trust?.ontology?.methods?.some((item) => item.id === "retrieval-practice")) failures.push("active-recall protocol missing Retrieval Practice Method");
const protocol = protocolBySlug.get("active-recall-test-yourself");
if (!protocol) failures.push("active-recall protocol missing from Trusted Protocol Feed");

for (const required of ["Use Active Recall for Retention, Then Practice Application", "Remembering and applying are different outcomes", "<h2>Sources</h2>", "10.1007/s10648-021-09595-9", "10.1037/xlm0001634", "10.1016/j.learninstruc.2026.102377", "Separate retention from application"]) {
  if (!page.includes(required)) failures.push(`active-recall public page missing: ${required}`);
}
for (const forbidden of ["improve long-term retention by 20–50%", "improved recall accuracy from roughly 60% to 85%", "20–40% gains in retention", "at least 20% improvement", "Research shows habits can take 21-66 days to form", "At MetalHatsCats"]) {
  if (page.toLowerCase().includes(forbidden.toLowerCase())) failures.push(`retired active-recall claim leaked: ${forbidden}`);
}
for (const required of ["Retrieval practice: memory is not application", "66%", "105 fourth-grade pupils", "<h2>Sources</h2>", "challenge-existing"]) {
  if (!note.includes(required)) failures.push(`retrieval-practice research note missing: ${required}`);
}
for (const html of [memoryTopic, skillTopic, methodPage]) if (!html.includes("/life-os/active-recall-test-yourself/")) failures.push("active-recall protocol missing from one ontology collection");
if (!sitemap.includes("https://brali-lifeos.github.io/research/retrieval-practice-memory-is-not-application/")) failures.push("retrieval-practice research note missing from sitemap");

if (failures.length) throw new Error(`Retrieval-practice boundary validation failed with ${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
console.log("Retrieval-practice boundary verified: two challenge-existing decisions, reviewed active-recall protocol, retention/application boundary preserved.");
