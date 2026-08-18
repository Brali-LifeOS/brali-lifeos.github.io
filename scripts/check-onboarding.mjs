import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const page = await readFile(path.join(root, "docs/index.html"), "utf8");
const flagships = JSON.parse(await readFile(path.join(root, "life-os/datasets/flagships.json"), "utf8"));
let failures = 0;

for (const marker of [
  "Run one small experiment",
  "/life-os/flagships/",
  "Make the next action concrete",
  "Decide what signal you will capture",
  "Put the experiment into Brali",
  "Review before adding more",
  "Choose → practice → capture one signal → review → keep, change, or drop.",
]) {
  if (!page.includes(marker)) failures += 1;
}

if ((flagships.entries ?? []).length !== 7) failures += 1;
const weeklyTheme = (flagships.entries ?? []).find((entry) => entry.slug === "weekly-theme-learning-sprints");
if (!weeklyTheme || !page.includes(`/life-os/${weeklyTheme.slug}/`)) failures += 1;
if (/Begin with one honest week\.|Create a daily planning rhythm/.test(page)) failures += 1;

if (failures) throw new Error(`Getting-started onboarding validation failed with ${failures} problem(s).`);
console.log("Getting-started flow verified: one experiment first, modules second, review before expansion.");
