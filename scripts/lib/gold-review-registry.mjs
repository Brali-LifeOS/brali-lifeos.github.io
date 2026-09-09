import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const supplementalPattern = /^gold-20-reviews-.+\.json$/;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function loadGoldReviewRegistry(root = process.cwd()) {
  const dataDir = path.join(root, 'data');
  const basePath = path.join(dataDir, 'gold-20-reviews.json');
  const base = await readJson(basePath);
  if (base.schema_version !== 1 || !base.entries || typeof base.entries !== 'object') {
    throw new Error('Gold review base registry must use schema_version 1 with an entries object.');
  }

  const files = (await readdir(dataDir))
    .filter(name => supplementalPattern.test(name))
    .sort();
  const entries = { ...base.entries };
  const sources = ['data/gold-20-reviews.json'];

  for (const file of files) {
    const rel = `data/${file}`;
    const supplemental = await readJson(path.join(dataDir, file));
    if (supplemental.schema_version !== 1 || !supplemental.entries || typeof supplemental.entries !== 'object') {
      throw new Error(`${rel}: Gold review supplemental must use schema_version 1 with an entries object.`);
    }
    for (const [slug, review] of Object.entries(supplemental.entries)) {
      if (entries[slug]) {
        throw new Error(`${rel}: duplicate Gold review for ${slug}; revise the existing review instead of shadowing it.`);
      }
      if (review?.slug !== slug) {
        throw new Error(`${rel}: Gold review key/slug mismatch for ${slug}.`);
      }
      entries[slug] = review;
    }
    sources.push(rel);
  }

  return {
    schema_version: 1,
    description: base.description,
    entries,
    registry_sources: sources,
  };
}
