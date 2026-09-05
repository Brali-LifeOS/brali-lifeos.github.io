import fs from "node:fs";
import path from "node:path";

const containerId = "GTM-5TJVLJG9";
const marker = "brali-consent-analytics";
const ignored = new Set([".git", ".github", ".tmp", "node_modules", "releases", "reports", "test-results"]);
const root = path.resolve(process.argv[2] || ".");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const target = path.join(directory, entry.name);
    return entry.isDirectory()
      ? walk(target)
      : entry.isFile() && entry.name.endsWith(".html")
        ? [target]
        : [];
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

const banner = `<aside id="brali-analytics-consent" role="dialog" aria-label="Analytics preference" style="position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(410px,calc(100vw - 32px));padding:17px;border:2px solid #171717;border-radius:16px;background:#fff;color:#171717;font:14px/1.45 system-ui,sans-serif;box-shadow:7px 7px 0 #171717">
  <strong style="display:block;margin-bottom:6px;font-size:17px">Optional analytics</strong>
  <span>Allow anonymous usage measurement with Google Analytics? Nothing is sent to Google before you accept.</span>
  <span style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
    <button type="button" onclick="braliAnalyticsConsent.grant()" style="padding:8px 12px;border:1px solid #171717;border-radius:999px;background:#171717;color:#fff;font:inherit;font-weight:700;cursor:pointer">Allow analytics</button>
    <button type="button" onclick="braliAnalyticsConsent.deny()" style="padding:8px 12px;border:1px solid #171717;border-radius:999px;background:#fff;color:#171717;font:inherit;font-weight:700;cursor:pointer">Necessary only</button>
  </span>
</aside>
<script>(function(){try{if(localStorage.getItem('brali-analytics-consent-v1')){var n=document.getElementById('brali-analytics-consent');if(n)n.remove();}}catch(e){}})();</script>`;

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
  if (!/<\/head>/i.test(html) || !/<body(?:\s[^>]*)?>/i.test(html)) {
    throw new Error(`Missing head/body in ${file}`);
  }
  html = html.replace(/<\/head>/i, `${head}\n</head>`);
  html = html.replace(/<body(?:\s[^>]*)?>/i, (opening) => `${opening}\n${banner}`);
  fs.writeFileSync(file, html);
  changed += 1;
}

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const loaders = (html.match(/googletagmanager\.com\/gtm\.js/g) || []).length;
  if (!html.includes(marker) || loaders !== 1) {
    throw new Error(`Analytics invariant failed for ${file}: marker=${html.includes(marker)} loaders=${loaders}`);
  }
}

console.log(`analytics_id=${containerId} html=${files.length} changed=${changed} duplicate_loaders=0`);
