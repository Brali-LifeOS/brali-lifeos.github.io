import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadKnowledgeOntology } from "./lib/knowledge-ontology.mjs";

const root = process.cwd();
const { ontology } = await loadKnowledgeOntology(root);
const output = path.join(root, "life-os/datasets/ontology.json");

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(ontology, null, 2)}\n`);

console.log(`Published merged knowledge ontology dataset: ${ontology.domains.length} domains, ${ontology.topics.length} topics, ${ontology.methods.length} methods, ${ontology.lenses.length} lenses, ${Object.keys(ontology.legacy_zone_map ?? {}).length} legacy zones mapped.`);
