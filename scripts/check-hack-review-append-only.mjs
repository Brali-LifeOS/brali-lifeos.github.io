import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const registryPath = path.join(root, "data", "hack-review-events.json");
const current = JSON.parse(fs.readFileSync(registryPath, "utf8"));

function assertRegistry(value, label) {
  if (!value || value.schema_version !== 1 || !Array.isArray(value.events)) {
    throw new Error(`${label}: expected schema_version 1 with an events array`);
  }
  const seen = new Set();
  for (const event of value.events) {
    if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.id !== "string" || !event.id) {
      throw new Error(`${label}: every event must be an object with a stable id`);
    }
    if (seen.has(event.id)) throw new Error(`${label}: duplicate event id ${event.id}`);
    seen.add(event.id);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return JSON.stringify(canonical(value));
}

assertRegistry(current, "current registry");

let baseRef = process.env.BRALI_LIFECYCLE_BASE_REF || "";
if (!baseRef && process.env.GITHUB_BASE_REF) baseRef = `origin/${process.env.GITHUB_BASE_REF}`;
if (!baseRef && process.env.GITHUB_REF_NAME === "main") baseRef = "HEAD^";

if (!baseRef) {
  console.log(`Hack review registry structural check passed: ${current.events.length} event(s); append-only comparison skipped because no base ref is available.`);
  process.exit(0);
}

let previousText;
try {
  previousText = execFileSync("git", ["show", `${baseRef}:data/hack-review-events.json`], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  const stderr = String(error?.stderr || "");
  if (/does not exist|exists on disk, but not in|Path .* does not exist/i.test(stderr)) {
    console.log(`Hack review registry has no predecessor at ${baseRef}; append-only comparison starts with this revision.`);
    process.exit(0);
  }
  throw new Error(`Cannot read lifecycle base ${baseRef}: ${stderr || error.message}`);
}

const previous = JSON.parse(previousText);
assertRegistry(previous, `base registry ${baseRef}`);

if (current.schema_version !== previous.schema_version) {
  throw new Error(`Hack review registry schema version changed from ${previous.schema_version} to ${current.schema_version}; migrate explicitly instead of rewriting append-only history.`);
}
if (current.events.length < previous.events.length) {
  throw new Error(`Hack review history is append-only: ${previous.events.length - current.events.length} existing event(s) were removed.`);
}

for (let index = 0; index < previous.events.length; index += 1) {
  const before = previous.events[index];
  const after = current.events[index];
  if (!after || before.id !== after.id) {
    throw new Error(`Hack review history is append-only: event position ${index + 1} changed from ${before.id} to ${after?.id || "missing"}. Add new events at the end.`);
  }
  if (fingerprint(before) !== fingerprint(after)) {
    throw new Error(`Hack review history is immutable: existing event ${before.id} was edited. Append a correction or superseding event instead.`);
  }
}

console.log(`Hack review append-only gate passed against ${baseRef}: ${previous.events.length} existing event(s) preserved; ${current.events.length - previous.events.length} appended.`);
