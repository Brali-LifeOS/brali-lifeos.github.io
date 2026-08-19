import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const fail = (message) => { throw new Error(`Coverage gap closure check failed: ${message}`); };
const ids = (values = []) => values.map((value) => typeof value === "string" ? value : value?.id).filter(Boolean);

const protocols = read("life-os/datasets/protocols.json").entries ?? [];
const hubs = read("life-os/datasets/topic-hubs.json").hubs ?? [];
const evaluation = read("life-os/datasets/agent-evaluation.json").cases ?? [];
const decisions = read("life-os/datasets/evidence-decisions.json").entries ?? [];

function requireProtocol(slug, topicId) {
  const protocol = protocols.find((entry) => entry.slug === slug);
  if (!protocol) fail(`trusted Protocol Feed missing ${slug}`);
  if (protocol.evidence?.status !== "reviewed") fail(`${slug} must be reviewed, got ${protocol.evidence?.status}`);
  if (!protocol.evidence?.source_url) fail(`${slug} lacks reviewed source URL`);
  if (!ids(protocol.ontology?.topics).includes(topicId)) fail(`${slug} is not mapped to Topic ${topicId}`);
  if (!protocol.action || !protocol.check_in) fail(`${slug} lacks action/check-in contract`);
  return protocol;
}

requireProtocol("ideal-sleep-hours-finder", "sleep-circadian");
requireProtocol("relationship-repair-coach", "conflict-repair");

for (const decisionId of ["sleep-opportunity-extension-2021", "apology-repair-2021"]) {
  const decision = decisions.find((entry) => entry.id === decisionId);
  if (!decision) fail(`published Evidence Decision missing ${decisionId}`);
  if (decision.decision !== "propose-protocol" || decision.source_reviewed !== true || !decision.source_url) fail(`${decisionId} lacks reviewed proposal provenance`);
  if (!Array.isArray(decision.limitations) || !decision.limitations.length) fail(`${decisionId} lacks explicit limitations`);
}

const sleepHub = hubs.find((hub) => hub.slug === "sleep");
if (!sleepHub) fail("Sleep Topic Hub missing");
if (sleepHub.coverage_status !== "trusted-protocols") fail(`Sleep hub still reports ${sleepHub.coverage_status}`);
if (!(sleepHub.protocols ?? []).some((entry) => entry.slug === "ideal-sleep-hours-finder")) fail("Sleep hub does not surface reviewed sleep protocol");

const expectedCases = new Map([
  ["sleep-routine", "ideal-sleep-hours-finder"],
  ["ru-sleep", "ideal-sleep-hours-finder"],
  ["conflict-repair", "relationship-repair-coach"],
]);
for (const [caseId, slug] of expectedCases) {
  const result = evaluation.find((entry) => entry.id === caseId);
  if (!result) fail(`Agent Evaluation case missing ${caseId}`);
  if (!result.pass) fail(`${caseId} still fails: ${(result.gaps ?? []).join(", ")}`);
  if (!(result.structured_brali?.protocol_slugs ?? []).includes(slug)) fail(`${caseId} does not retrieve ${slug}`);
}

console.log("Coverage gaps verified: Sleep and Conflict Repair have reviewed protocols, evidence provenance, hub coverage, and passing EN/RU retrieval cases.");
