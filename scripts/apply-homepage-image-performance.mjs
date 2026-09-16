import { readFile, writeFile } from 'node:fs/promises';

const path = 'index.html';
let html = await readFile(path, 'utf8');

function setAttr(tag, name, value) {
  const pattern = new RegExp(`\\s${name}=(?:"[^"]*"|'[^']*')`, 'i');
  if (pattern.test(tag)) return tag.replace(pattern, ` ${name}="${value}"`);
  return tag.replace(/\s*\/>$|>$/, match => ` ${name}="${value}"${match}`);
}

function removeAttr(tag, name) {
  return tag.replace(new RegExp(`\\s${name}=(?:"[^"]*"|'[^']*')`, 'ig'), '');
}

let heroCount = 0;
let deferredCount = 0;
html = html.replace(/<img\b[^>]*>/gi, tag => {
  if (/class="[^"]*hero-mascot[^"]*"/i.test(tag)) {
    heroCount += 1;
    let next = removeAttr(tag, 'loading');
    next = setAttr(next, 'fetchpriority', 'high');
    next = setAttr(next, 'decoding', 'async');
    return next;
  }

  if (/src="[^"]*brali-category-[^"]*"/i.test(tag) || /class="[^"]*audience-visual[^"]*"/i.test(tag)) {
    deferredCount += 1;
    let next = setAttr(tag, 'loading', 'lazy');
    next = setAttr(next, 'decoding', 'async');
    return next;
  }

  return tag;
});

if (heroCount !== 1) throw new Error(`Expected exactly one homepage hero mascot image, found ${heroCount}.`);
if (deferredCount < 10) throw new Error(`Expected at least 10 below-fold topic/audience images, found ${deferredCount}.`);

await writeFile(path, html);
console.log(`Homepage image loading optimized: ${heroCount} priority hero image, ${deferredCount} deferred below-fold images.`);
