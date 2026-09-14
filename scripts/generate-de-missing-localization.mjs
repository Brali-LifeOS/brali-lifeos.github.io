import fs from 'node:fs';
import path from 'node:path';
import { loadLocalizationAuthoringIndex, localizationSourceSnapshot } from './lib/localization-source.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'data/localization/de/library');
const MODEL_ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const MODEL = process.env.GERMAN_LOCALIZATION_MODEL || 'openai/gpt-4.1-mini';
const BATCH_SIZE = Number(process.env.GERMAN_LOCALIZATION_BATCH_SIZE || 8);
const MAX_BATCHES = Number(process.env.GERMAN_LOCALIZATION_MAX_BATCHES || 10);
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is required');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const unwrap = (value) => Array.isArray(value) ? value : Array.isArray(value?.records) ? value.records : Array.isArray(value?.entries) ? value.entries : [];
const flagshipDoc = readJson(path.join(ROOT, 'data/localization/de/flagships.json'));
const flagshipSlugs = new Set((flagshipDoc.entries || []).map((entry) => entry.slug));

function existingGermanSlugs() {
  const slugs = new Set(flagshipSlugs);
  if (!fs.existsSync(OUT_DIR)) return slugs;
  for (const name of fs.readdirSync(OUT_DIR).filter((x) => x.endsWith('.json'))) {
    let parsed; try { parsed = readJson(path.join(OUT_DIR, name)); } catch { continue; }
    for (const record of unwrap(parsed)) if (record?.slug) slugs.add(record.slug);
  }
  return slugs;
}
function nextBatchNumber() {
  let max = 0;
  if (!fs.existsSync(OUT_DIR)) return 1;
  for (const name of fs.readdirSync(OUT_DIR)) {
    const match = name.match(/^(\d{4})-/); if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}
function stripFence(text) {
  const trimmed = text.trim(); const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}
function validateTranslation(chunk, value) {
  const rows = Array.isArray(value) ? value : value?.records;
  if (!Array.isArray(rows)) throw new Error('Model output is not an array');
  if (rows.length !== chunk.length || chunk.some((item, i) => rows[i]?.slug !== item.slug)) throw new Error('Slug/order mismatch');
  for (const row of rows) {
    for (const key of ['title','subtitle','description']) if (typeof row[key] !== 'string' || row[key].trim().length < 8) throw new Error(`Invalid ${key} for ${row.slug}`);
    const visible = `${row.title} ${row.subtitle} ${row.description}`;
    if (/\b(as an ai|i cannot|translation:)\b/i.test(visible) || /[А-Яа-яЁё]/.test(visible)) throw new Error(`Meta/language leakage for ${row.slug}`);
  }
  return rows;
}
const SYSTEM_PROMPT = `You are the German production localization reviewer for Brali LifeOS, an evidence-aware public knowledge base.
Return ONLY valid JSON: an array in exactly the input slug order. Each item: slug, title, subtitle, description, quality_state. Set quality_state to "language-reviewed" only after silently reviewing your draft.
Write idiomatic contemporary Standard German for Germany, semi-formal and concise; use "Sie" where direct address helps. Preserve stable slugs, brands, established framework names/acronyms and real method identifiers. Avoid unnecessary Denglisch, hype, motivational clichés and literal English syntax. Preserve practical intent but NEVER strengthen evidence. You may conservatively weaken unsafe or overstated source advice while preserving the recognizable topic. Health/exercise/sleep/nutrition/supplements/medication/mental-health: no invented fixed dose, diagnosis or treatment claim; add a proportionate professional-care boundary for meaningful risk or clinical symptoms; do not encourage unsafe exposure, breath holding, extreme training or stopping medication. Psychology/persuasion: no mind-reading, guaranteed influence, lie detection or deterministic personality inference. Demystify weak NLP, quantum, power-pose and similar claims. Productivity magic numbers are optional templates. Bias/decision entries should support evidence, calibration, reversibility, base rates or explicit uncertainty when relevant. Titles useful and specific; subtitles clarify mechanism/boundary; descriptions usually 2–4 compact actionable sentences. Never invent studies, numbers, citations, diagnoses or guarantees. Never mention translation, AI output, source repair or localization.`;
async function callModel(chunk) {
  const payload = chunk.map((r) => ({slug:r.slug,title:r.title||'',subtitle:r.subtitle||'',description:r.description||''}));
  const body = {model:MODEL,temperature:0.2,max_tokens:5200,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:`Localize and self-review:\n${JSON.stringify(payload)}`}]};
  let lastError;
  for (let attempt=1; attempt<=4; attempt++) {
    try {
      const response = await fetch(MODEL_ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
      const raw = await response.text(); if (!response.ok) throw new Error(`GitHub Models ${response.status}: ${raw.slice(0,500)}`);
      const content = JSON.parse(raw)?.choices?.[0]?.message?.content; if (typeof content !== 'string') throw new Error('Missing model response content');
      return validateTranslation(chunk, JSON.parse(stripFence(content)));
    } catch (error) { lastError=error; if (attempt<4) await new Promise((r)=>setTimeout(r,1500*2**(attempt-1))); }
  }
  throw lastError;
}

fs.mkdirSync(OUT_DIR,{recursive:true});
const canonical = await loadLocalizationAuthoringIndex(ROOT);
const existing = existingGermanSlugs();
const missing = canonical.filter((record)=>!existing.has(record.slug));
console.log(`German coverage before fill: ${canonical.length-missing.length}/${canonical.length}; missing=${missing.length}`);
if (!missing.length) process.exit(0);
let batchNo=nextBatchNumber(), completed=0;
for (let offset=0; offset<missing.length && completed<MAX_BATCHES; offset+=BATCH_SIZE) {
  const chunk=missing.slice(offset,offset+BATCH_SIZE);
  try {
    console.log(`Localizing batch ${batchNo}: ${chunk[0].slug} .. ${chunk.at(-1).slug}`);
    const translated=await callModel(chunk);
    const records=translated.map((row,i)=>({slug:row.slug,source:localizationSourceSnapshot(chunk[i]),title:row.title.trim(),subtitle:row.subtitle.trim(),description:row.description.trim(),quality_state:'language-reviewed'}));
    const document={schema_version:1,locale:'de',batch:`auto-${String(batchNo).padStart(4,'0')}`,quality:'language-reviewed',generation:{method:'github-models-bounded-fill',model:MODEL,policy:'self-reviewed German localization; exact canonical source snapshot retained'},records};
    fs.writeFileSync(path.join(OUT_DIR,`${String(batchNo).padStart(4,'0')}-auto-fill.json`),`${JSON.stringify(document,null,2)}\n`);
    batchNo++; completed++;
  } catch (error) { console.error(`Stopped after ${completed} batches: ${error.stack||error}`); break; }
}
const after=existingGermanSlugs();
const remaining=canonical.filter((record)=>!after.has(record.slug));
console.log(`Fill wrote ${completed} batch(es). Remaining records: ${remaining.length}.`);
if (remaining.length) console.log(`Next missing: ${remaining[0].slug}`);
