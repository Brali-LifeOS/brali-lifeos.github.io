import { access, readFile } from "node:fs/promises";
import path from "node:path";

const required = [
  "index.html",
  "features/index.html",
  "how-it-works/index.html",
  "screenshots/index.html",
  "docs/index.html",
  "download/index.html",
  "privacy/index.html",
  "terms/index.html",
  "support/index.html",
  "changelog/index.html",
  "life-os/index.html",
  "life-os/areas/index.html",
  "sitemap.xml",
  "robots.txt",
  "llms.txt",
  "product-facts.json",
  "redirect-map.md",
];

for (const file of required) await access(path.join(process.cwd(), file));

const sitemap = await readFile(path.join(process.cwd(), "sitemap.xml"), "utf8");
if (!sitemap.includes("https://brali-lifeos.github.io/life-os/")) throw new Error("Sitemap lacks migrated Life OS pages.");
if (!sitemap.includes("https://brali-lifeos.github.io/life-os/areas/")) throw new Error("Sitemap lacks life area navigation pages.");
if (sitemap.includes("metalhatscats.com")) throw new Error("Sitemap still references MetalHatsCats.");

const library = await readFile(path.join(process.cwd(), "life-os/index.html"), "utf8");
if (!library.includes('href="/life-os/areas/"')) throw new Error("Growth Library does not link to life areas.");

console.log(`Static site verified: ${required.length} core files, Growth Library pages, and life area navigation.`);
