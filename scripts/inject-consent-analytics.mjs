import fs from "node:fs";
import path from "node:path";

// These final-surface generators intentionally run after the core site, brand shell,
// discovery and localization builds, but before analytics walks the HTML corpus.
// Lifecycle provenance is built first, reviewed Evidence Decisions are linked without
// changing verdicts, unresolved research metadata becomes a noindex review watchlist,
// sponsorship remains downstream of lifecycle status, and localized lifecycle/trust
// pages are generated before the shared consent-aware analytics pass.
await import("./build-hack-lifecycle.mjs");
await import("./enrich-hack-lifecycle-evidence.mjs");
await import("./build-research-lifecycle-watchlist.mjs");
await import("./apply-sponsorships.mjs");
await import("./build-ru-lifecycle-surfaces.mjs");

const containerId = "GTM-5TJVLJG9";
const marker = "brali-consent-analytics";
const ignoredTopLevel = new Set([".git", ".github", ".tmp", "data", "node_modules", "releases", "reports", "test-results"]);
const repoRoot = process.cwd();
const root = path.resolve(process.argv[2] || ".");
const profile = JSON.parse(fs.readFileSync(path.join(repoRoot, ".arwp", "localization.json"), "utf8"));
const consentRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "localization", "consent.json"), "utf8"));

if (consentRegistry.schema_version !== 1 || consentRegistry.source_locale !== profile.sourceLocale || !consentRegistry.locales || typeof consentRegistry.locales !== "object") {
  throw new Error("Localized analytics consent registry does not match the localization profile");
}

const requiredConsentFields = ["aria", "title", "body", "allow", "deny"];
const requiredConsentLocales = new Set([
  profile.sourceLocale,
  ...(profile.locales || []).filter((entry) => entry.role === "human-interface").map((entry) => entry.code),
]);
for (const locale of requiredConsentLocales) {
  const localized = consentRegistry.locales[locale];
  if (!localized) throw new Error(`Missing analytics consent copy for declared locale ${locale}`);
  for (const field of requiredConsentFields) {
    if (typeof localized[field] !== "string" || !localized[field].trim()) throw new Error(`Missing analytics consent field ${locale}.${field}`);
  }
}

function isIgnoredTarget(target) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false;
  const [topLevel] = relative.split(path.sep);
  return ignoredTopLevel.has(topLevel);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (isIgnoredTarget(target)) return [];
    return entry.isDirectory() ? walk(target) : entry.isFile() && entry.name.endsWith(".html") ? [target] : [];
  });
}

const head = `<!-- ${marker} -->
<script>
(function(w,d,id){
  var key='brali-analytics-consent-v1';
  function load(){
    if(w.__braliGtmLoaded||d.querySelector('script[data-brali-gtm="'+id+'"]'))return;
    w.__braliGtmLoaded=true;
    w.dataLayer=w.dataLayer||[];
    w.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});
    var s=d.createElement('script');
    s.async=true;
    s.dataset.braliGtm=id;
    s.src='https://www.googletagmanager.com/gtm.js?id='+encodeURIComponent(id);
    d.head.appendChild(s);
  }
  w.braliAnalyticsConsent={
    grant:function(){try{localStorage.setItem(key,'granted');}catch(e){}load();var n=d.getElementById('brali-analytics-consent');if(n)n.remove();},
    deny:function(){try{localStorage.setItem(key,'denied');}catch(e){}var n=d.getElementById('brali-analytics-consent');if(n)n.remove();}
  };
  try{if(localStorage.getItem(key)==='granted')load();}catch(e){}
})(window,document,'${containerId}');
</script>`;

function consentCopyFor(lang) {
  return consentRegistry.locales[lang] || consentRegistry.locales[profile.sourceLocale];
}

function bannerFor(lang) {
  const text = consentCopyFor(lang);
  return `<aside id="brali-analytics-consent" data-nosnippet role="dialog" aria-label="${text.aria}" style="position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(410px,calc(100vw - 32px));padding:17px;border:2px solid #171717;border-radius:16px;background:#fff;color:#171717;font:14px/1.45 system-ui,sans-serif;box-shadow:7px 7px 0 #171717">
  <strong style="display:block;margin-bottom:6px;font-size:17px">${text.title}</strong>
  <span>${text.body}</span>
  <span style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
    <button type="button" onclick="braliAnalyticsConsent.grant()" style="padding:8px 12px;border:1px solid #171717;border-radius:999px;background:#171717;color:#fff;font:inherit;font-weight:700;cursor:pointer">${text.allow}</button>
    <button type="button" onclick="braliAnalyticsConsent.deny()" style="padding:8px 12px;border:1px solid #171717;border-radius:999px;background:#fff;color:#171717;font:inherit;font-weight:700;cursor:pointer">${text.deny}</button>
  </span>
</aside>
<script>(function(){try{if(localStorage.getItem('brali-analytics-consent-v1')){var n=document.getElementById('brali-analytics-consent');if(n)n.remove();}}catch(e){}})();</script>`;
}

if (!fs.existsSync(root)) throw new Error(`Missing analytics target: ${root}`);
const files = walk(root);
if (!files.length) throw new Error(`No HTML files below ${root}`);
let changed = 0;

for (const file of files) {
  let html = fs.readFileSync(file, "utf8");
  if (html.includes(marker)) continue;
  if (/googletagmanager\.com\/(?:gtag\/js|gtm\.js)|GTM-[A-Z0-9]+|gtag\s*\(/i.test(html)) {
    throw new Error(`Existing analytics/tag manager detected in ${file}; refusing duplicate installation`);
  }
  if (!/<\/head>/i.test(html) || !/<body(?:\s[^>]*)?>/i.test(html)) throw new Error(`Missing head/body in ${file}`);
  const lang = html.match(/<html[^>]*\blang=["']([^"']+)["']/i)?.[1]?.split("-")[0]?.toLowerCase() || profile.sourceLocale;
  html = html.replace(/<\/head>/i, `${head}\n</head>`);
  html = html.replace(/<body(?:\s[^>]*)?>/i, (opening) => `${opening}\n${bannerFor(lang)}`);
  fs.writeFileSync(file, html);
  changed += 1;
}

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const loaders = (html.match(/googletagmanager\.com\/gtm\.js/g) || []).length;
  if (!html.includes(marker) || loaders !== 1) throw new Error(`Analytics invariant failed for ${file}: marker=${html.includes(marker)} loaders=${loaders}`);
}

console.log(`analytics_id=${containerId} html=${files.length} changed=${changed} duplicate_loaders=0 consent_locales=${[...requiredConsentLocales].sort().join(",")}`);
