import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const base = "https://brali-lifeos.github.io";
const license = "https://creativecommons.org/licenses/by-nc-sa/4.0/";
const index = JSON.parse(await readFile(path.join(root, "data/life-os-content/index.json"), "utf8"));
const evidence = JSON.parse(await readFile(path.join(root, "life-os/datasets/evidence.json"), "utf8"));
const evidenceBySlug = new Map((evidence.entries ?? []).map((record) => [record.slug, record]));
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const robots = await readFile(path.join(root, "robots.txt"), "utf8");
const skillPackHtml = await readFile(path.join(root, "skill-packs/index.html"), "utf8");
const skillPackApp = await readFile(path.join(root, "skill-packs/app.js"), "utf8");
const violations = [];
let representative = 0;
let skillAvailable = 0;
let pendingReference = 0;
let restricted = 0;

const fail = (label) => violations.push(label);
const requireCondition = (condition, label) => { if (!condition) fail(label); };
const metaContent = (html, name, attribute = "name") => html.match(new RegExp(`<meta\\b[^>]*\\b${attribute}=["']${name}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`, "i"))?.[1] ?? null;
const imageUrl = (value) => typeof value === "string" ? value : value?.url ?? value?.contentUrl ?? null;
const isRepresentative = (url) => Boolean(url) && !/\/brali-logo\.png(?:[?#]|$)/i.test(url);
const isTrusted = (record) => record?.indexable === true && ["reviewed", "practical"].includes(record?.status);
const isPendingReference = (record) => record?.status === "pending-review" && record?.sensitive !== true;

requireCondition(/User-agent:\s*OAI-SearchBot[\s\S]*?Allow:\s*\//i.test(robots), "robots: OAI-SearchBot is not explicitly allowed");
requireCondition(/User-agent:\s*GPTBot[\s\S]*?(?:Allow|Disallow):\s*\//i.test(robots), "robots: GPTBot policy is missing");

const homepage = await readFile(path.join(root, "index.html"), "utf8");
requireCondition(homepage.includes('data-brali-growth-identity="true"'), "homepage: Brali growth identity marker is missing");
requireCondition(/max-image-preview:large/i.test(homepage), "homepage: max-image-preview:large is missing");

const updates = await readFile(path.join(root, "updates/index.html"), "utf8");
requireCondition(updates.includes('data-brali-preferred-source="true"'), "updates: preferred-source marker is missing");
requireCondition(updates.includes("google.com/preferences/source?q=brali-lifeos.github.io"), "updates: Google preferred-source link is missing");

const skillPageRequirements = [
  ['<link rel="canonical" href="https://brali-lifeos.github.io/skill-packs/">', "skill-packs: canonical link is missing"],
  ['/life-os/datasets/protocols.json', "skill-packs: Trusted Protocol Feed link is missing"],
  ['/skill-packs/library.json', "skill-packs: complete one-skill-per-hack library link is missing"],
  ['/skill-packs/catalog.json', "skill-packs: trusted machine-readable catalog link is missing"],
  ['SKILL.md', "skill-packs: SKILL.md capability marker is missing"],
  ['reviewed', "skill-packs: reviewed trust-state explanation is missing"],
  ['practical', "skill-packs: practical trust-state explanation is missing"],
  ['Review required', "skill-packs: pending-review skill mode explanation is missing"],
  ['Restricted', "skill-packs: restricted skill mode explanation is missing"],
  ['not a ranking shortcut', "skill-packs: ranking-boundary disclaimer is missing"],
  ['gh skill install Brali-LifeOS/brali-lifeos.github.io brali-life-os', "skill-packs: router install command is missing"],
];
for (const [marker, label] of skillPageRequirements) requireCondition(skillPackHtml.includes(marker), label);
try { new Function(skillPackApp); } catch (error) { fail(`skill-packs/app.js: syntax error: ${error.message}`); }
requireCondition(skillPackApp.includes('catalogUrl = "/skill-packs/library.json"'), "skill-packs/app.js: complete skill library is not the UI source");
requireCondition(skillPackApp.includes('trustedStates = new Set(["reviewed", "practical"])'), "skill-packs/app.js: trusted-state filter is missing");
requireCondition(skillPackApp.includes("Brali does not recommend review-gated records as trusted skills"), "skill-packs/app.js: review-gated recommendation boundary is missing");
requireCondition(skillPackApp.includes('entry.skill_mode === "review-required"'), "skill-packs/app.js: review-required mode is missing");
requireCondition(skillPackApp.includes('entry.skill_mode === "restricted-reference"'), "skill-packs/app.js: restricted-reference mode is missing");
requireCondition(sitemap.includes(`<loc>${base}/skill-packs/</loc>`), "sitemap: /skill-packs/ is missing");

for (const entry of index) {
  const pagePath = path.join(root, "life-os", entry.slug, "index.html");
  const html = await readFile(pagePath, "utf8");
  const pathname = `/life-os/${entry.slug}/`;
  const stableSkillPath = `/skill-packs/${entry.slug}/`;
  const ogImage = metaContent(html, "og:image", "property");
  const evidenceRecord = evidenceBySlug.get(entry.slug);
  const trusted = isTrusted(evidenceRecord);
  const reference = isPendingReference(evidenceRecord);
  const inSitemap = sitemap.includes(`<loc>${base}${pathname}</loc>`);
  const skillInSitemap = sitemap.includes(`<loc>${base}${stableSkillPath}</loc>`);
  const noindex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);
  const required = [
    ['data-agent-reuse="true"', "agent reuse marker"],
    ['data-agent-reuse-license="CC-BY-NC-SA-4.0"', "reuse license marker"],
    [`href="${pathname}index.json"`, "protocol JSON link"],
    ['href="/cite/"', "citation link"],
    ['<meta property="og:site_name" content="Brali">', "og:site_name"],
    [`<link rel="license" href="${license}">`, "license link"],
  ];
  for (const [marker, label] of required) requireCondition(html.includes(marker), `${entry.slug}: missing ${label}`);
  requireCondition((html.match(/data-agent-reuse="true"/g) ?? []).length === 1, `${entry.slug}: expected exactly one agent reuse block`);
  requireCondition(html.lastIndexOf('data-agent-reuse="true"') >= html.lastIndexOf('data-related-protocols="true"'), `${entry.slug}: agent reuse block appears before related protocols`);

  if (trusted) {
    skillAvailable += 1;
    requireCondition(html.includes('data-agent-skill="available"'), `${entry.slug}: trusted page missing skill-available marker`);
    requireCondition(html.includes(`href="${stableSkillPath}"`), `${entry.slug}: trusted page missing stable skill link`);
    requireCondition(!html.includes(`href="/skill-packs/?hack=${entry.slug}"`), `${entry.slug}: trusted page still uses query-only skill link`);
    requireCondition(html.includes('href="/for-ai/integrations/"'), `${entry.slug}: trusted page missing AI integrations link`);
    requireCondition(!noindex && inSitemap && /max-image-preview:large/i.test(html), `${entry.slug}: trusted search visibility contract failed`);
    requireCondition(skillInSitemap, `${entry.slug}: trusted skill page missing from sitemap`);
  } else {
    requireCondition(html.includes('data-agent-skill="review-gated"'), `${entry.slug}: review-gated page missing review-gated skill marker`);
    requireCondition(!html.includes(`href="${stableSkillPath}"`), `${entry.slug}: review-gated source page leaked a promoted stable skill link`);
    requireCondition(!skillInSitemap, `${entry.slug}: review-gated skill page leaked into sitemap`);
    if (reference) {
      pendingReference += 1;
      requireCondition(!noindex && inSitemap && /max-image-preview:large/i.test(html), `${entry.slug}: pending-review reference search visibility contract failed`);
      requireCondition(html.includes('data-legacy-content-state="historical-source-only"'), `${entry.slug}: pending-review reference missing historical-only marker`);
      requireCondition(html.includes('Review record:'), `${entry.slug}: pending-review reference lacks neutral review-record title`);
      requireCondition(!html.includes('Try it, then review.'), `${entry.slug}: pending-review reference leaked inherited action copy`);
    } else {
      restricted += 1;
      requireCondition(noindex && !inSitemap, `${entry.slug}: restricted search-withheld contract failed`);
    }
  }

  const schemaMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  try {
    const schema = JSON.parse(schemaMatch?.[1] ?? "null");
    const graph = schema?.["@graph"] ?? [];
    const article = graph.find((node) => node?.["@type"] === "Article");
    const webPage = graph.find((node) => node?.["@type"] === "WebPage");
    requireCondition(article?.license === license && article?.usageInfo === `${base}/terms/` && article?.isAccessibleForFree === true, `${entry.slug}: Article licensing/usage schema drift`);
    requireCondition(article?.encoding?.contentUrl === `${base}${pathname}index.json`, `${entry.slug}: Article JSON encoding URL drift`);
    requireCondition(webPage?.license === license && webPage?.mainEntity?.["@id"] === article?.["@id"], `${entry.slug}: WebPage mainEntity/license schema drift`);
    const actionTarget = article?.potentialAction?.target;
    requireCondition(trusted ? actionTarget === `${base}${stableSkillPath}` : !actionTarget, `${entry.slug}: stable skill potentialAction trust parity failed`);
    if (reference) requireCondition(article?.creativeWorkStatus === 'Pending review' && article?.genre === 'Brali review record', `${entry.slug}: pending-review structured-data framing drift`);
    if (isRepresentative(ogImage)) {
      representative += 1;
      requireCondition(metaContent(html, "twitter:card") === "summary_large_image", `${entry.slug}: representative image missing summary_large_image card`);
      requireCondition(metaContent(html, "twitter:image") === ogImage, `${entry.slug}: twitter:image differs from og:image`);
      requireCondition(imageUrl(article?.image) === ogImage, `${entry.slug}: Article image differs from og:image`);
      requireCondition(imageUrl(webPage?.primaryImageOfPage) === ogImage, `${entry.slug}: WebPage primaryImageOfPage differs from og:image`);
    }
  } catch (error) {
    fail(`${entry.slug}: JSON-LD parse/validation error: ${error.message}`);
  }
}

requireCondition(representative > 0, "site: no representative hack image was found");
requireCondition(skillAvailable > 0, "site: no trusted skill-enabled hack was found");
requireCondition(pendingReference > 0, "site: no pending-review reference page was found");
requireCondition(restricted > 0, "site: no restricted search-withheld hack was found");

if (violations.length) {
  const preview = violations.slice(0, 25).map((item) => `- ${item}`).join("\n");
  throw new Error(`Hack discovery validation failed with ${violations.length} contract violation(s):\n${preview}${violations.length > 25 ? `\n- ... ${violations.length - 25} more` : ""}`);
}
console.log(`Hack discovery verified for ${index.length} pages: complete skill library exposed; ${skillAvailable} trusted promoted skill pages, ${pendingReference} pending-review neutral references, ${restricted} restricted search-withheld; ${representative} expose representative large-image metadata.`);
