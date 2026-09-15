import { readFile, writeFile } from "node:fs/promises";

const file = "data/localization/de/zones.json";
const zones = JSON.parse(await readFile(file, "utf8"));
if (zones.locale !== "de" || !Array.isArray(zones.records)) throw new Error("Unexpected German zones schema");
const slug = "using-ai";
const existing = zones.records.find((entry) => entry.slug === slug);
const localized = {
  slug,
  title: "KI sinnvoll einsetzen",
  subtitle: "Nutzen Sie KI dort, wo sie ihren Platz verdient: entwerfen, erkunden, strukturieren und prüfen – während Verifikation, Verantwortung und die endgültige Entscheidung beim Menschen bleiben."
};
if (existing) {
  Object.assign(existing, localized);
} else {
  zones.records.push(localized);
}
const canonical = JSON.parse(await readFile("data/life-os-zones.json", "utf8"));
const order = new Map(canonical.map((entry, index) => [entry.slug, index]));
zones.records.sort((a, b) => (order.get(a.slug) ?? 9999) - (order.get(b.slug) ?? 9999));
await writeFile(file, `${JSON.stringify(zones, null, 2)}\n`);
console.log(`German zones aligned: ${zones.records.length}/${canonical.length}; using-ai localized.`);
