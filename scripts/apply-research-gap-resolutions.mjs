import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const resolutions = read('data/research-gap-resolutions.json');
const ontologyPath = path.join(ROOT, 'data/knowledge-ontology.json');
const ontology = JSON.parse(fs.readFileSync(ontologyPath, 'utf8'));
const topicById = new Map((ontology.topics ?? []).map(topic => [topic.id, topic]));
const changed = [];

for (const resolution of resolutions.entries ?? []) {
  const topic = topicById.get(resolution.topic_id);
  if (!topic) throw new Error(`Research gap resolution references unknown Topic: ${resolution.topic_id}`);
  if (resolution.status !== 'closed') throw new Error(`Unsupported research gap resolution status for ${resolution.topic_id}: ${resolution.status}`);
  if (topic.status !== 'active') {
    topic.status = 'active';
    changed.push(resolution.topic_id);
  }
}

if (changed.length) fs.writeFileSync(ontologyPath, `${JSON.stringify(ontology, null, 2)}\n`);
console.log(`Research gap resolutions applied: ${(resolutions.entries ?? []).length} closed; ${changed.length} ontology Topic status change(s).`);
