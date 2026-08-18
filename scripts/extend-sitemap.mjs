import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root=process.cwd(), base="https://brali-lifeos.github.io", sitemapPath=path.join(root,"sitemap.xml");
const routes=["/research/","/research/habits-take-time/","/research/rag-is-not-a-trust-button/","/research/sleep-regularity-signal-not-prescription/","/for-ai/","/agents/","/faq/","/partners/","/terms/"];
let xml=await readFile(sitemapPath,"utf8"); const missing=routes.filter(route=>!xml.includes(`<loc>${base}${route}</loc>`));
if(missing.length){const additions=missing.map(route=>`  <url><loc>${base}${route}</loc></url>`).join("\n"); xml=xml.replace("</urlset>",`${additions}\n</urlset>`); await writeFile(sitemapPath,xml);}
console.log(`Sitemap static routes: ${routes.length-missing.length} already present, ${missing.length} added.`);
