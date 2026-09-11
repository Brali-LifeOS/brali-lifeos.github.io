import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectClaims, normalizeClaimText } from "./lib/claim-taxonomy.mjs";
import { claimPattern, sensitiveZones } from "./lib/content-trust.mjs";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const index = JSON.parse(await readFile(path.join(contentRoot, "index.json"), "utf8"));

const DROP_PATTERNS = [
  /\bAt MetalHatsCats\b/i,
  /\bMetalHatsCats Team\b/i,
  /\bwe (?:observed|measured|found|saw|recorded)\b/i,
  /\b(?:our|the) (?:pilot|trial|experiment|test|data)\b/i,
  /\b(?:scientifically proven|proven method|works every time|guaranteed results?)\b/i,
];

const HIGH_RISK_TEXT = /\b(?:suicid(?:e|al)?|self[- ]?harm|depress(?:ion|ive)?|panic(?: attack)?|trauma(?:tic)?|ptsd|phobi(?:a|c)|exposure(?: therapy)?|diagnos(?:e|is|ed)|treat(?:ment|s|ed)?|medicat(?:ion|e|ed)|prescription|dose|symptoms?|disease|disorder|insomnia|blood pressure|heart rate|cardiac|cardiovascular|cold shower|ice bath|fasting|breath[- ]?hold|hyperventilat(?:e|ion)|eating disorder|purging|calorie restriction|extreme exercise|max(?:imum)? effort)\b/i;
const HARD_SENSITIVE_ZONES = new Set(["cardio-doc"]);

function htmlToText(value = "") {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function sentenceCandidates(value = "") {
  const plain = htmlToText(value);
  if (!plain) return [];
  return plain
    .replace(/\s*[•·]\s*/g, ". ")
    .split(/(?<=[.!?])\s+|\s*[\n\r]+\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function claimFree(sentence) {
  const text = normalizeClaimText(sentence);
  if (!text) return false;
  const inspection = inspectClaims(text, { exampleLimitPerCategory: 1 });
  if (inspection.categories.length > 0) return false;
  if (claimPattern.test(text)) return false;
  return !DROP_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeText(value, { maxSentences = 3, maxChars = 700 } = {}) {
  const accepted = [];
  const seen = new Set();
  for (const candidate of sentenceCandidates(value)) {
    if (!claimFree(candidate)) continue;
    const cleaned = candidate
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\b(?:Brali LifeOS|Life OS) app\b/gi, "the tracker")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || cleaned.length < 8) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push(cleaned);
    if (accepted.length >= maxSentences || accepted.join(" ").length >= maxChars) break;
  }
  return accepted.join(" ").slice(0, maxChars).trim();
}

function humanizeSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((token) => token.length <= 3 ? token.toUpperCase() : token[0].toUpperCase() + token.slice(1))
    .join(" ");
}

function safeTitle(article, slug) {
  const title = sanitizeText(article.title, { maxSentences: 1, maxChars: 110 });
  return title || humanizeSlug(slug);
}

function collectSafeContext(article) {
  const sources = [
    article.description,
    article.body?.intro?.html,
    ...(article.body?.sections ?? []).flatMap((section) => [section?.title, section?.html]),
  ];
  const snippets = [];
  const seen = new Set();
  for (const source of sources) {
    const text = sanitizeText(source, { maxSentences: 2, maxChars: 360 });
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    snippets.push(text);
    if (snippets.length >= 3) break;
  }
  return snippets;
}

function shouldMassCurate(article) {
  if (article.editorialCuration?.status === "curated") return false;
  const publicBits = [
    article.title,
    article.subtitle,
    article.description,
    article.lifeOsSource?.hack,
    article.lifeOsSource?.whatYouDo,
    article.lifeOsSource?.checkIn,
    ...(article.faq ?? []).flatMap((item) => [item.question, item.answer]),
    article.body?.intro?.html,
    article.body?.markdown,
    ...(article.body?.sections ?? []).flatMap((section) => [section?.title, section?.html]),
  ];
  const inspection = inspectClaims(publicBits, { exampleLimitPerCategory: 1 });
  return inspection.categories.length > 0 || claimPattern.test(JSON.stringify(publicBits)) || /MetalHatsCats/i.test(JSON.stringify(publicBits));
}

function curateArticle(article, entry) {
  const title = safeTitle(article, entry.slug);
  const subtitle = sanitizeText(article.subtitle, { maxSentences: 1, maxChars: 150 }) || `A bounded way to try ${title.toLowerCase()} without assuming a guaranteed result.`;
  const description = sanitizeText(article.description, { maxSentences: 2, maxChars: 280 })
    || `Use ${title.toLowerCase()} as a small practical experiment. Define the situation, choose an observable action, try it in an appropriate context, and review what actually happened.`;
  const hack = sanitizeText(article.lifeOsSource?.hack, { maxSentences: 2, maxChars: 300 }) || description;
  const action = sanitizeText(article.lifeOsSource?.whatYouDo, { maxSentences: 3, maxChars: 520 })
    || `Define one concrete situation where ${title.toLowerCase()} could be useful. Choose a small action you can perform directly, try it once, and note the observable result before deciding whether to repeat or adapt it.`;
  const checkIn = sanitizeText(article.lifeOsSource?.checkIn, { maxSentences: 2, maxChars: 260 })
    || "What did I do, what happened, what changed in the situation, and what should I keep, change, or stop next time?";
  const context = collectSafeContext(article);
  const zoneSensitive = sensitiveZones.has(entry.zone?.slug);
  const inheritedRiskText = normalizeClaimText([
    article.title,
    article.subtitle,
    article.description,
    article.lifeOsSource?.hack,
    article.lifeOsSource?.whatYouDo,
    entry.slug,
  ]);
  const highRisk = HARD_SENSITIVE_ZONES.has(entry.zone?.slug) || HIGH_RISK_TEXT.test(inheritedRiskText);
  const boundary = zoneSensitive
    ? "Keep this as a general self-reflection, planning, communication, or everyday practice. If the situation is high-stakes, unsafe, or outside ordinary self-guided use, stop and use appropriate qualified support instead."
    : "Treat this as a practical experiment rather than a promised effect. Keep the action small enough to observe, and change or stop it when the context no longer fits.";

  article.title = title;
  article.subtitle = subtitle;
  article.description = description;
  article.lifeOsSource = {
    ...(article.lifeOsSource ?? {}),
    hack,
    whatYouDo: action,
    checkIn,
  };
  article.faq = [
    {
      id: `${entry.slug}-faq-1`,
      question: "How should I start?",
      answer: action,
      answerHtml: `<p>${escapeHtml(action)}</p>`,
    },
    {
      id: `${entry.slug}-faq-2`,
      question: "How do I decide whether to keep using it?",
      answer: "Record the action you took and the observable result. Keep the parts that fit your context, change the parts that create friction, and drop the practice when it is not useful.",
      answerHtml: "<p>Record the action you took and the observable result. Keep the parts that fit your context, change the parts that create friction, and drop the practice when it is not useful.</p>",
    },
    {
      id: `${entry.slug}-faq-3`,
      question: "What are the boundaries?",
      answer: boundary,
      answerHtml: `<p>${escapeHtml(boundary)}</p>`,
    },
  ];

  const contextHtml = context.length
    ? `<p>${context.map(escapeHtml).join(" ")}</p>`
    : `<p>${escapeHtml(description)}</p>`;
  article.body = {
    intro: {
      html: `<p>${escapeHtml(description)}</p>`,
    },
    sections: [
      {
        slug: "situation",
        title: "1. Define the situation",
        html: contextHtml,
      },
      {
        slug: "action",
        title: "2. Choose the smallest useful action",
        html: `<p>${escapeHtml(action)}</p>`,
      },
      {
        slug: "boundary",
        title: "3. Keep the practice bounded",
        html: `<p>${escapeHtml(boundary)}</p>`,
      },
      {
        slug: "review",
        title: "4. Review what actually happened",
        html: `<p>${escapeHtml(checkIn)}</p><p>Use your own observation to decide the next step. Do not turn one good or bad attempt into a universal rule.</p>`,
      },
    ],
  };

  for (const legacyField of ["helpSeoLong", "helpSeoShort", "structuredMeta"]) delete article[legacyField];
  if (article.meta?.authorName && /metalhatscats/i.test(article.meta.authorName)) {
    article.meta.authorName = "Brali";
    article.meta.authorUrl = "/";
  }
  article.trustverseCuration = {
    schema_version: 1,
    mode: "claim-cleanup",
    evidence_status_intent: highRisk ? "retain-review-gate" : "practical-if-clean",
    curated_at: "2026-09-11",
    rule: "Unsupported inherited evidence, quantitative, first-party and guarantee language is removed; the retained page is bounded to observable practical action.",
    originated_in_sensitive_zone: zoneSensitive,
    retained_high_risk_gate: highRisk,
  };
  return { article, zoneSensitive, highRisk };
}

const report = {
  schema_version: 1,
  curated_at: "2026-09-11",
  entries_checked: index.length,
  curated: 0,
  sensitive_zone_curated: 0,
  retained_high_risk_gate: 0,
  slugs: [],
  high_risk_slugs: [],
};

for (const entry of index) {
  const file = path.join(contentRoot, `${entry.slug}.json`);
  const article = JSON.parse(await readFile(file, "utf8"));
  if (!shouldMassCurate(article)) continue;
  const result = curateArticle(article, entry);
  await writeFile(file, `${JSON.stringify(result.article, null, 2)}\n`);
  report.curated += 1;
  report.slugs.push(entry.slug);
  if (result.zoneSensitive) report.sensitive_zone_curated += 1;
  if (result.highRisk) {
    report.retained_high_risk_gate += 1;
    report.high_risk_slugs.push(entry.slug);
  }
}

report.slugs.sort();
report.high_risk_slugs.sort();
await writeFile(path.join(root, ".trustverse-mass-curation-applied.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Trustverse mass curation applied: ${report.curated}/${report.entries_checked} legacy entries rewritten; ${report.sensitive_zone_curated} originated in sensitive zones; ${report.retained_high_risk_gate} retained explicit high-risk gates.`);
