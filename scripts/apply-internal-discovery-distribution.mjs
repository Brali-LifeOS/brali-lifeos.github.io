import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const BASE = 'https://brali-lifeos.github.io';
const content = JSON.parse(await readFile(path.join(root, 'data/life-os-content/index.json'), 'utf8'));
const evidence = JSON.parse(await readFile(path.join(root, 'life-os/datasets/evidence.json'), 'utf8'));
const areas = JSON.parse(await readFile(path.join(root, 'data/life-areas.json'), 'utf8'));
const evidenceBySlug = new Map((evidence.entries || []).map((entry) => [entry.slug, entry]));
const areaBySlug = new Map(areas.map((area) => [area.slug, area]));
const sourceBySlug = new Map(content.map((entry) => [entry.slug, entry]));

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canonicalFrom = (html) => html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] || '';
const h1From = (html) => String(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function utilityBar(status) {
  return `<div class="page-utility" data-page-utility><span class="page-utility__meta">${escapeHtml(status)}</span><div class="page-utility__actions" aria-label="Page tools"><button type="button" data-page-action="save" aria-pressed="false">Save</button><button type="button" data-page-action="share">Share</button><button type="button" data-page-action="copy">Copy link</button><button type="button" data-page-action="cite">Cite</button></div><span class="page-utility__status" data-page-utility-status role="status" aria-live="polite"></span></div>`;
}
function continuation(items) {
  const cards = items.map((item) => `<a class="continuation-card" href="${escapeHtml(item.href)}"><span>${escapeHtml(item.job)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.note)}</small></a>`).join('');
  return `<section class="prose internal-continuation" data-internal-discovery-continuation><p class="card-label">Continue from here</p><h2>Choose the next useful path.</h2><div class="continuation-grid">${cards}</div></section>`;
}
async function exists(relative) { try { await access(path.join(root, relative)); return true; } catch { return false; } }

const indexable = (evidence.entries || []).filter((entry) => entry.indexable === true && sourceBySlug.has(entry.slug));
let changed = 0;
for (const record of indexable) {
  const source = sourceBySlug.get(record.slug);
  const file = path.join(root, 'life-os', record.slug, 'index.html');
  let html = await readFile(file, 'utf8');
  const expectedCanonical = `${BASE}/life-os/${record.slug}/`;
  if (canonicalFrom(html) !== expectedCanonical) throw new Error(`${record.slug}: canonical mismatch before Internal Discovery application.`);
  if (!h1From(html)) throw new Error(`${record.slug}: missing h1.`);

  if (!html.includes('data-page-utility')) {
    html = html.replace(/(<h1\b[^>]*>[\s\S]*?<\/h1>)/i, `$1${utilityBar(record.status === 'reviewed' ? 'Reviewed protocol' : 'Practical protocol')}`);
  }

  if (!html.includes('data-internal-discovery-continuation')) {
    const legacy = record.ontology?.legacy || {};
    const areaSlug = legacy.life_area_slug;
    const zoneSlug = legacy.growth_zone_slug || record.zone || source.zone?.slug;
    const area = areaBySlug.get(areaSlug);
    const items = [];
    if (zoneSlug && await exists(`life-os/${zoneSlug}/index.html`)) items.push({job:'Explore zone', title: source.zone?.title || zoneSlug, href:`/life-os/${zoneSlug}/`, note:'See the wider Growth Zone that contains this protocol.'});
    if (areaSlug && area && await exists(`life-os/areas/${areaSlug}/index.html`)) items.push({job:'Browse life area', title:area.title, href:`/life-os/areas/${areaSlug}/`, note:'Step back to a broader life-area view before choosing another protocol.'});
    const topic = record.ontology?.topics?.[0];
    if (topic?.id && await exists(`ontology/topics/${topic.id}/index.html`)) items.push({job:'Explore topic', title:topic.title || topic.id, href:`/ontology/topics/${topic.id}/`, note:'Follow the maintained knowledge topic behind this protocol.'});
    if (items.length < 2) items.push({job:'Browse library', title:'Brali Growth Library', href:'/life-os/', note:'Return to the full practical protocol library.'});
    if (items.length < 2) throw new Error(`${record.slug}: could not build two canonical continuation paths.`);
    const block = continuation(items.slice(0, 3));
    if (html.includes('<section class="prose related-protocols"')) html = html.replace('<section class="prose related-protocols"', `${block}<section class="prose related-protocols"`);
    else html = html.replace('</main>', `${block}</main>`);
  }

  if (!html.includes('src="/internal-discovery.js"')) html = html.replace('</body>', '<script src="/internal-discovery.js" defer></script></body>');
  await writeFile(file, html);
  changed += 1;
}

const stylesPath = path.join(root, 'styles.css');
let styles = await readFile(stylesPath, 'utf8');
if (!styles.includes('/* ARWP Internal Discovery & Distribution */')) {
  styles += `\n/* ARWP Internal Discovery & Distribution */\n.page-utility{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;margin:1rem 0 1.4rem;padding:.65rem .8rem;border:2px solid var(--ink,#111);border-radius:14px;background:rgba(255,255,255,.76)}.page-utility__meta{font-weight:800;margin-right:auto}.page-utility__actions{display:flex;gap:.4rem;flex-wrap:wrap}.page-utility button{font:inherit;font-weight:800;border:1px solid currentColor;border-radius:999px;padding:.36rem .62rem;background:#fff;cursor:pointer}.page-utility__status{font-size:.8rem;min-height:1.2em}.internal-continuation{margin-top:2.5rem;padding-top:1.35rem;border-top:2px solid currentColor}.continuation-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem}.continuation-card{display:flex;flex-direction:column;gap:.35rem;padding:1rem;border:2px solid currentColor;border-radius:15px;text-decoration:none;background:rgba(255,255,255,.7)}.continuation-card span{font-size:.72rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.continuation-card strong{font-size:1.05rem}.continuation-card small{line-height:1.4}@media(max-width:780px){.continuation-grid{grid-template-columns:1fr}}\n`;
  await writeFile(stylesPath, styles);
}
await writeFile(path.join(root, 'internal-discovery.js'), `(()=>{const canonical=()=>document.querySelector('link[rel="canonical"]')?.href||location.href;const title=()=>document.querySelector('h1')?.textContent?.trim()||document.title;const say=(bar,msg)=>{const n=bar.querySelector('[data-page-utility-status]');if(n){n.textContent=msg;setTimeout(()=>n.textContent='',2200)}};document.querySelectorAll('[data-page-utility]').forEach(bar=>{bar.addEventListener('click',async e=>{const b=e.target.closest('[data-page-action]');if(!b)return;const u=canonical(),a=b.dataset.pageAction;try{if(a==='share'&&navigator.share){await navigator.share({title:title(),url:u});say(bar,'Shared');return}if(a==='save'){const k='brali:saved-protocols',s=new Set(JSON.parse(localStorage.getItem(k)||'[]'));if(s.has(u)){s.delete(u);b.setAttribute('aria-pressed','false');say(bar,'Removed from this browser')}else{s.add(u);b.setAttribute('aria-pressed','true');say(bar,'Saved in this browser')}localStorage.setItem(k,JSON.stringify([...s]));return}const text=a==='cite'?\`Brali. \${title()}. \${u}\`:u;await navigator.clipboard.writeText(text);say(bar,a==='cite'?'Citation copied':'Link copied')}catch{say(bar,'Could not complete that action')}});try{const s=new Set(JSON.parse(localStorage.getItem('brali:saved-protocols')||'[]'));bar.querySelector('[data-page-action="save"]')?.setAttribute('aria-pressed',String(s.has(canonical())))}catch{}})})();`);

await writeFile(path.join(root, 'life-os/datasets/internal-discovery.json'), JSON.stringify({schema_version:1,generated_at:new Date().toISOString(),arwp_revision:'793483e3404a97f7892e86bcda3fd317d5c7427c',canonical_indexable_protocols:indexable.length,enhanced_slugs:indexable.map((entry)=>entry.slug),relationship_sources:['Growth Zone','Life Area','maintained ontology topic','existing Related protocols']}, null, 2) + '\n');
console.log(`Internal Discovery & Distribution applied to ${changed} canonical indexable Brali protocols; existing Related protocols preserved.`);
