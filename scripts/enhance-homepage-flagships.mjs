import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const file = path.join(root, "index.html");
let html = await readFile(file, "utf8");

if (!html.includes('href="/life-os/flagships/"')) {
  html = html.replace(
    '<div class="links"><a href="/life-os/areas/">Life Areas</a><a href="/life-os/">Growth Library</a><a href="/docs/">Getting started</a><a class="button yellow" href="/download/">Get Brali</a></div>',
    '<div class="links"><a href="/life-os/flagships/">Start here</a><a href="/life-os/areas/">Life Areas</a><a href="/life-os/">Growth Library</a><a class="button yellow" href="/download/">Get Brali</a></div>',
  );
  html = html.replace(
    '<div class="hero-actions"><a class="button yellow" href="/life-os/areas/">Choose a Life Area</a><a class="button quiet" href="/life-os/">Browse all protocols</a></div>',
    '<div class="hero-actions"><a class="button yellow" href="/life-os/flagships/">Start with 7 curated protocols</a><a class="button quiet" href="/life-os/areas/">Choose a Life Area</a></div>',
  );
  html = html.replace(
    '<div class="footer-links"><a href="/life-os/areas/">Life Areas</a>',
    '<div class="footer-links"><a href="/life-os/flagships/">Start here</a><a href="/life-os/areas/">Life Areas</a>',
  );
}

if (!html.includes('href="/life-os/flagships/"')) throw new Error("Could not add flagship collection to the homepage.");
await writeFile(file, html);
console.log("Homepage now uses the curated flagship collection as the primary starting path.");
