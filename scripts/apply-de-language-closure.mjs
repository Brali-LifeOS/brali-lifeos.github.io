import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const fixes = [
  {
    file: "data/localization/de/library/0022-disconfirming-calcium.json",
    slug: "dont-break-the-chain-tracker",
    fields: {
      subtitle: "Eine sichtbare Serie mit einer geplanten Regel für Unterbrechungen",
    },
  },
  {
    file: "data/localization/de/library/0028-future-self-green-upgrade.json",
    slug: "golden-circle-coach",
    fields: {
      subtitle: "Zweck, Vorgehen und Angebot als klare Kommunikationsstruktur",
    },
  },
  {
    file: "data/localization/de/library/0069-weekly-meal-planning-made-easy-win-win-negotiation-coach.json",
    slug: "why-first-communication-coach",
    fields: {
      subtitle: "Simon Sineks Zweck-zuerst-Struktur",
      description: "Wenn Zuhörer den Kontext noch nicht kennen, beginne mit dem Zweck oder Problem, bevor du in Details gehst. Der Ansatz ist eng mit Simon Sineks Kommunikationsmodell verbunden. Er ist besonders nützlich, wenn der Zweck tatsächlich relevant und glaubwürdig ist – nicht als Pflichtformel für jede Nachricht.",
    },
  },
];

let changedFiles = 0;
for (const fix of fixes) {
  const absolute = path.join(root, fix.file);
  const doc = JSON.parse(await readFile(absolute, "utf8"));
  const records = Array.isArray(doc.records) ? doc.records : Array.isArray(doc.entries) ? doc.entries : [];
  const record = records.find((item) => item.slug === fix.slug);
  if (!record) throw new Error(`Missing German record ${fix.slug} in ${fix.file}`);
  const target = record.localized && typeof record.localized === "object" ? record.localized : record;
  let changed = false;
  for (const [field, value] of Object.entries(fix.fields)) {
    if (target[field] !== value) {
      target[field] = value;
      changed = true;
    }
  }
  if (changed) {
    await writeFile(absolute, `${JSON.stringify(doc, null, 2)}\n`);
    changedFiles += 1;
  }
}

console.log(`Applied German language closure fixes across ${changedFiles} file(s).`);
