const SITE = "https://brali-lifeos.github.io";
const SAMPLE = 12;

const fail = (message) => { throw new Error(`live_image_discovery:${message}`); };
const decode = (value = "") => String(value).replaceAll("&amp;", "&").trim();

async function get(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "Brali-Image-Discovery-Check/1.0" } });
      if (response.ok) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw lastError;
}

const [sitemapResponse, manifestResponse] = await Promise.all([
  get(`${SITE}/sitemap.xml`),
  get(`${SITE}/data/image-discovery.json`)
]);
const sitemap = await sitemapResponse.text();
const manifest = await manifestResponse.json();
if (!Array.isArray(manifest.records) || !manifest.records.length) fail("live manifest has no records");
if (!sitemap.includes("xmlns:image=\"http://www.google.com/schemas/sitemap-image/1.1\"")) fail("live sitemap lacks image namespace");

const records = manifest.records.slice(0, SAMPLE);
for (const record of records) {
  if (!sitemap.includes(`<image:loc>${record.image}</image:loc>`)) fail(`live sitemap omits ${record.image}`);
  const [pageResponse, imageResponse] = await Promise.all([get(record.page), get(record.image)]);
  const html = await pageResponse.text();
  if (!html.includes(`property="og:image" content="${record.image}"`) && !html.includes(`content="${record.image}" property="og:image"`)) fail(`live og:image mismatch: ${record.page}`);
  if (!html.includes(`name="twitter:image" content="${record.image}"`) && !html.includes(`content="${record.image}" name="twitter:image"`)) fail(`live twitter:image mismatch: ${record.page}`);
  if (!/max-image-preview\s*:\s*large/i.test(html)) fail(`live large-image preview missing: ${record.page}`);
  const type = (imageResponse.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("image/")) fail(`live preferred image is not image content: ${record.image} (${type || "unknown"})`);
}

console.log(`Brali live Image Discovery passed on ${records.length}/${manifest.records.length} representative record(s).`);
