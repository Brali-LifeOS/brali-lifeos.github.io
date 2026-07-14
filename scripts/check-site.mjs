import { access, readFile } from "node:fs/promises";
import path from "node:path";
const required = ["index.html", "features/index.html", "how-it-works/index.html", "screenshots/index.html", "docs/index.html", "download/index.html", "privacy/index.html", "terms/index.html", "support/index.html", "changelog/index.html", "life-os/index.html", "sitemap.xml", "robots.txt", "llms.txt", "product-facts.json", "redirect-map.md"];
for (const file of required) await access(path.join(process.cwd(), file));
const sitemap = await readFile(path.join(process.cwd(), "sitemap.xml"), "utf8");
if (!sitemap.includes("https://brali-lifeos.github.io/life-os/")) throw new Error("Sitemap lacks migrated Life OS pages.");
if (sitemap.includes("metalhatscats.com")) throw new Error("Sitemap still references MetalHatsCats.");
console.log(`Static site verified: ${required.length} core files and Life OS sitemap entries.`);
