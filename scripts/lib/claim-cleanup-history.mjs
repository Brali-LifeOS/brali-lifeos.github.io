import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const FILE_PATTERN = /^claim-cleanup-decisions-batch-(\d+)\.json$/;

export async function loadClaimCleanupHistory(root) {
  const dataDir = path.join(root, 'data');
  const names = await readdir(dataDir);
  const files = names
    .map(name => {
      const match = name.match(FILE_PATTERN);
      return match ? { name, number: Number(match[1]), rel: `data/${name}` } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.number - right.number || left.name.localeCompare(right.name));

  const batches = [];
  for (const file of files) {
    const document = JSON.parse(await readFile(path.join(root, file.rel), 'utf8'));
    batches.push({ ...file, document });
  }

  const entries = batches.flatMap(batch => batch.document.entries ?? []);
  const completedSlugs = entries.map(entry => entry.slug);

  return {
    files,
    batches,
    entries,
    completedSlugs,
    completedSlugSet: new Set(completedSlugs),
  };
}

export function publicClaimCleanupHistory(history) {
  return {
    schema_version: 1,
    name: 'Brali completed claim cleanup history',
    counts: {
      batches: history.batches.length,
      completed: history.entries.length,
    },
    batches: history.batches.map(batch => ({
      batch_number: batch.number,
      batch_id: batch.document.batch_id,
      selected_at: batch.document.selected_at,
      decisions_url: `/${batch.rel}`,
      selection_basis: batch.document.selection_basis,
      observed_initial_queue: batch.document.observed_initial_queue,
      completed_slugs: batch.document.selection_order ?? [],
      dispositions: Object.fromEntries(
        [...new Set((batch.document.entries ?? []).map(entry => entry.disposition))]
          .sort((left, right) => left.localeCompare(right))
          .map(disposition => [
            disposition,
            (batch.document.entries ?? []).filter(entry => entry.disposition === disposition).length,
          ]),
      ),
    })),
  };
}
