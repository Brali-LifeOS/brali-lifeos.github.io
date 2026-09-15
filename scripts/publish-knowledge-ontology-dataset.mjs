import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadKnowledgeOntology } from "./lib/knowledge-ontology.mjs";

const root = process.cwd();
const { ontology, overrides } = await loadKnowledgeOntology(root);
const datasetRoot = path.join(root, "life-os/datasets");
await mkdir(datasetRoot, { recursive: true });
await writeFile(path.join(datasetRoot, "ontology.json"), `${JSON.stringify(ontology, null, 2)}\n`);
await writeFile(path.join(datasetRoot, "ontology-overrides.json"), `${JSON.stringify(overrides, null, 2)}\n`);

console.log(`Published merged knowledge ontology dataset: ${ontology.domains.length} domains, ${ontology.topics.length} topics, ${ontology.methods.length} methods, ${ontology.lenses.length} lenses, ${Object.keys(ontology.legacy_zone_map ?? {}).length} legacy zones mapped, ${Object.keys(overrides.entries ?? {}).length} reviewed record overrides.`);
