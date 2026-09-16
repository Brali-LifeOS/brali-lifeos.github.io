import fs from "node:fs";
import path from "node:path";

const output = path.resolve(process.cwd(), process.argv[2] || ".");
const homepage = path.join(output, "index.html");
if (!fs.existsSync(homepage)) throw new Error(`Missing public homepage: ${homepage}`);
let html = fs.readFileSync(homepage, "utf8");
if (html.includes('data-goose-arwp-proof-mark="0.1"')) process.exit(0);
const product = "https://dkharlanau.github.io/agent-ready-web-profile/product/";
const contract = "https://github.com/dkharlanau/agent-ready-web-profile/blob/main/docs/PROOF-MARK.md";
const metadata = `<meta name="goose-arwp-proof" content="version=0.1; coverage=partial; scope=incomplete" data-goose-arwp-proof-mark="0.1" data-arwp-coverage="partial"><link rel="help" href="${contract}" data-goose-arwp-contract="0.1"><link rel="related" href="${product}" data-goose-arwp-product="true">`;
if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${metadata}</head>`);
else throw new Error("Public homepage has no closing head for Goose ARWP proof metadata");
fs.writeFileSync(homepage, html);
console.log("Goose ARWP machine proof staged: PARTIAL coverage; no public incomplete-scope badge emitted.");
