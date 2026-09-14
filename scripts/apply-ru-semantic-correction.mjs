import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dir = path.join(process.cwd(), "data", "localization", "ru", "library");
const target = "tension-sprints-for-problem-solving";
const description = "Если за столом вы застряли, после изучения материалов можно переключиться на знакомое несложное действие или спокойную прогулку и позже вернуться к задаче. Не удерживайте болезненную или утомительную позу ради «когнитивного напряжения»: физический дискомфорт не является доказанным усилителем качества решения.";
let hits = 0;
let changed = false;
for (const name of (await readdir(dir)).filter((name) => name.endsWith(".json")).sort()) {
  const file = path.join(dir, name);
  const batch = JSON.parse(await readFile(file, "utf8"));
  let dirty = false;
  for (const record of batch.records || []) {
    if (record.slug !== target) continue;
    hits += 1;
    if (record.description !== description) {
      record.description = description;
      dirty = true;
      changed = true;
    }
  }
  if (dirty) await writeFile(file, `${JSON.stringify(batch, null, 2)}\n`);
}
if (hits !== 1) throw new Error(`Expected ${target} exactly once; found ${hits}`);
console.log(`Semantic correction ${changed ? "applied" : "already present"}: ${target}`);
