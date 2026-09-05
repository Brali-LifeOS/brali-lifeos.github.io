import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const registry = JSON.parse(await readFile(path.join(root, 'data/outcome-observations.json'), 'utf8'));
const unresolvedTypes = new Set(['no_trusted_answer', 'bad_match', 'missing_knowledge']);
const reasonByType = {
  no_trusted_answer: 'coverage-gap',
  bad_match: 'retrieval-quality',
  missing_knowledge: 'knowledge-gap'
};

const items = [];
for (const observation of registry.observations ?? []) {
  const event = observation.event ?? {};
  if (!unresolvedTypes.has(event.event_type)) continue;
  items.push({
    id: `outcome-review:${event.event_id}`,
    source_event_id: event.event_id,
    category: event.event_type,
    queue_reason: reasonByType[event.event_type],
    occurred_at: event.occurred_at,
    dataset_version: event.dataset?.version ?? null,
    client_category: event.client?.category ?? null,
    topic_ids: [...new Set(event.result?.topic_ids ?? [])],
    protocol_ids: [...new Set(event.result?.protocol_ids ?? [])],
    result_state: event.result?.state ?? null,
    provenance: {
      source_channel: observation.provenance?.source_channel ?? null,
      source_url: observation.provenance?.source_url ?? null,
      reviewed_at: observation.provenance?.reviewed_at ?? null
    },
    review_status: 'new',
    raw_query_included: false,
    user_identifier_included: false
  });
}

items.sort((left, right) => String(left.occurred_at).localeCompare(String(right.occurred_at)) || left.id.localeCompare(right.id));
const counts = {
  total: items.length,
  no_trusted_answer: items.filter(item => item.category === 'no_trusted_answer').length,
  bad_match: items.filter(item => item.category === 'bad_match').length,
  missing_knowledge: items.filter(item => item.category === 'missing_knowledge').length
};

const output = {
  schema_version: 1,
  name: 'Brali unresolved outcome review queue',
  source: 'data/outcome-observations.json',
  description: 'Evaluation/editorial backlog derived only from reviewed opt-in unresolved outcome events. It intentionally omits raw query text and user identifiers; maintainers use canonical Topic/Protocol context and provenance to decide whether a reproducible evaluation case or editorial investigation is warranted.',
  counts,
  items
};

await mkdir(path.join(root, 'life-os/datasets'), { recursive: true });
await writeFile(path.join(root, 'life-os/datasets/outcome-review-queue.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Outcome review queue built: total=${counts.total}; no-answer=${counts.no_trusted_answer}; bad-match=${counts.bad_match}; missing-knowledge=${counts.missing_knowledge}; raw-query=false.`);
