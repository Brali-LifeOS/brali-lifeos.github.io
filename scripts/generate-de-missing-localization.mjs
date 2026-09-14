import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INDEX = path.join(ROOT, 'data/life-os-content/index.json');
const ADDITIONS = path.join(ROOT, 'data/life-os-content-additions.json');
const OUT_DIR = path.join(ROOT, 'data/localization/de/library');
const MODEL_ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const MODEL = process.env.GERMAN_LOCALIZATION_MODEL || 'openai/gpt-4.1-mini';
const BATCH_SIZE = Number(process.env.GERMAN_LOCALIZATION_BATCH_SIZE || 8);
const MAX_BATCHES = Number(process.env.GERMAN_LOCALIZATION_MAX_BATCHES || 8);
const token = process.env.GITHUB_TOKEN;

if (!token) throw new Error('GITHUB_TOKEN is required');

const flagshipSlugs = new Set([
  '25-minute-pomodoro-focus-sprints',
  'circles-of-control-planner',
  '10-minute-morning-stretch-routine',
  'weekly-theme-learning-sprints',
  'active-listening-exercises',
  'brainwriting-group-idea-generation',
  'start-with-a-hypothesis',
]);

function unwrapRecords(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.records)) return value.records;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function canonicalRecords() {
  const merged = new Map();
  for (const record of unwrapRecords(readJson(INDEX))) merged.set(record.slug, record);
  if (fs.existsSync(ADDITIONS)) {
    for (const record of unwrapRecords(readJson(ADDITIONS))) {
      if (!merged.has(record.slug)) merged.set(record.slug, record);
    }
  }
  return [...merged.values()];
}

function existingGermanSlugs() {
  const slugs = new Set();
  if (!fs.existsSync(OUT_DIR)) return slugs;
  for (const name of fs.readdirSync(OUT_DIR).filter((x) => x.endsWith('.json'))) {
    const file = path.join(OUT_DIR, name);
    let parsed;
    try { parsed = readJson(file); } catch { continue; }
    for (const record of unwrapRecords(parsed)) if (record?.slug) slugs.add(record.slug);
  }
  return slugs;
}

function nextBatchNumber() {
  let max = 0;
  if (!fs.existsSync(OUT_DIR)) return 1;
  for (const name of fs.readdirSync(OUT_DIR)) {
    const match = name.match(/^(\d{4})-/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function sourceSnapshot(record) {
  return {
    title: record.title ?? '',
    subtitle: record.subtitle ?? '',
    description: record.description ?? '',
    updatedISO: record.updatedISO ?? '',
  };
}

function stripFence(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function validateTranslation(chunk, value) {
  const rows = Array.isArray(value) ? value : value?.records;
  if (!Array.isArray(rows)) throw new Error('Model output is not an array');
  const wanted = chunk.map((x) => x.slug);
  const got = rows.map((x) => x?.slug);
  if (rows.length !== chunk.length || wanted.some((slug, i) => got[i] !== slug)) {
    throw new Error(`Slug/order mismatch. Wanted ${wanted.join(', ')}; got ${got.join(', ')}`);
  }
  for (const row of rows) {
    for (const key of ['title', 'subtitle', 'description']) {
      if (typeof row[key] !== 'string' || row[key].trim().length < 8) {
        throw new Error(`Invalid ${key} for ${row.slug}`);
      }
    }
    if (/\b(as an ai|i cannot|translation:)\b/i.test(`${row.title} ${row.subtitle} ${row.description}`)) {
      throw new Error(`Meta-output detected for ${row.slug}`);
    }
  }
  return rows;
}

const SYSTEM_PROMPT = `You are the German production localization reviewer for Brali LifeOS, an evidence-aware public knowledge base.

Return ONLY valid JSON: an array in exactly the same slug order as the input. Each item must contain exactly: slug, title, subtitle, description, quality_state. Set quality_state to "language-reviewed" only after silently reviewing and correcting your own draft.

German quality contract:
- Write idiomatic professional German for Germany, semi-formal and concise. Address the reader with "Sie" where direct address is useful.
- Do not translate stable slugs, brand names, established framework names, acronyms or real method identifiers (for example SMART, GROW, PREP, AIDA, TRIZ, Pomodoro, DBT). Explain them naturally in German around the identifier.
- Avoid unnecessary Denglisch, marketing hype, motivational clichés and literal English syntax.
- Preserve the practical intent, but NEVER strengthen an evidence claim beyond the English source. You may weaken or correct unsafe/overstated source advice while keeping the recognizable topic.
- Health, exercise, sleep, nutrition, supplements, medication and mental-health content: no universal fixed dose unless clearly established in context; no diagnosis or treatment claim; add an appropriate professional-care boundary when risk or clinical symptoms are involved; do not encourage unsafe exposure, breath holding, extreme training, stopping medication, or food/body moralizing.
- Psychology and persuasion: do not imply mind reading, guaranteed influence, lie detection or deterministic personality inference. Demystify weak NLP, "quantum", power-pose or similar claims while preserving the useful underlying exercise.
- Productivity magic numbers are optional templates, not scientific constants.
- Bias/decision cards should encourage evidence, calibration, reversibility, base rates or explicit uncertainty when relevant.
- Titles should be useful and specific. Subtitles should clarify mechanism or boundary. Descriptions should normally be 2–4 compact sentences and immediately actionable.
- Do not invent facts, studies, percentages, citations, diagnoses or guarantees.
- Keep the content self-contained; never mention that it is a translation, source repair, AI output or localization task.`;

async function callModel(chunk) {
  const payload = chunk.map((r) => ({
    slug: r.slug,
    title: r.title ?? '',
    subtitle: r.subtitle ?? '',
    description: r.description ?? '',
  }));
  const body = {
    model: MODEL,
    temperature: 0.25,
    max_tokens: 5200,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Localize and self-review these records:\n${JSON.stringify(payload, null, 2)}` },
    ],
  };

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(MODEL_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`GitHub Models ${response.status}: ${text.slice(0, 700)}`);
      const envelope = JSON.parse(text);
      const content = envelope?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('Missing model response content');
      return validateTranslation(chunk, JSON.parse(stripFence(content)));
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const canonical = canonicalRecords();
const existing = existingGermanSlugs();
const missing = canonical.filter((record) => !flagshipSlugs.has(record.slug) && !existing.has(record.slug));
console.log(`German library coverage before fill: ${canonical.length - flagshipSlugs.size - missing.length}/${canonical.length - flagshipSlugs.size}; missing=${missing.length}`);

if (!missing.length) {
  console.log('No missing non-flagship German records.');
  process.exit(0);
}

let batchNo = nextBatchNumber();
let completed = 0;
for (let offset = 0; offset < missing.length && completed < MAX_BATCHES; offset += BATCH_SIZE) {
  const chunk = missing.slice(offset, offset + BATCH_SIZE);
  try {
    console.log(`Localizing batch ${batchNo}: ${chunk[0].slug} .. ${chunk.at(-1).slug}`);
    const translated = await callModel(chunk);
    const records = translated.map((row, i) => ({
      slug: row.slug,
      source: sourceSnapshot(chunk[i]),
      title: row.title.trim(),
      subtitle: row.subtitle.trim(),
      description: row.description.trim(),
      quality_state: 'language-reviewed',
    }));
    const batch = `auto-${String(batchNo).padStart(4, '0')}`;
    const document = {
      schema_version: 1,
      locale: 'de',
      batch,
      quality: 'language-reviewed',
      generation: {
        method: 'github-models-bounded-fill',
        model: MODEL,
        policy: 'self-reviewed German production localization; exact canonical source snapshot retained',
      },
      records,
    };
    const filename = `${String(batchNo).padStart(4, '0')}-auto-fill.json`;
    fs.writeFileSync(path.join(OUT_DIR, filename), `${JSON.stringify(document, null, 2)}\n`);
    batchNo += 1;
    completed += 1;
  } catch (error) {
    console.error(`Stopped after ${completed} successful batches: ${error.stack || error}`);
    break;
  }
}

const after = existingGermanSlugs();
for (const name of fs.readdirSync(OUT_DIR).filter((x) => x.endsWith('.json'))) {
  let parsed;
  try { parsed = readJson(path.join(OUT_DIR, name)); } catch { continue; }
  for (const record of unwrapRecords(parsed)) if (record?.slug) after.add(record.slug);
}
const remaining = canonical.filter((record) => !flagshipSlugs.has(record.slug) && !after.has(record.slug));
console.log(`Fill wrote ${completed} batch(es). Remaining non-flagship records: ${remaining.length}.`);
if (remaining.length) console.log(`Next missing: ${remaining[0].slug}`);
