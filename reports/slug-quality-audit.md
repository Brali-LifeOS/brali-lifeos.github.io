# Brali slug quality audit

Date: 2026-08-22

## Scope

- 947 Growth Library hack/protocol slugs
- 1,209 public canonical pages
- Generated pages, datasets, API metadata, sitemap entries, and the Flagship 100 collection route

## Result

- Numeric-only hack slugs: 0
- Technical IDs such as `hack-123`, `entry-42`, or `page-7`: 0
- UUID/hash slugs: 0
- Duplicate hack slugs: 0
- Invalid slug shapes: 0
- Median hack slug length: 27 characters
- 95th percentile: 36 characters
- Maximum: 67 characters
- Numeric-leading slugs with semantic words: 20 (for example, `20-20-20-eye-break-reminder`)

The numeric-leading routes are meaningful protocol names or durations, not database identifiers.

## Canonical route improvement

The public Flagship 100 page moved from the numeric-only canonical route:

- Legacy: `/life-os/flagships/100/`
- Canonical: `/life-os/flagships/curated-100/`

The legacy route remains `noindex,follow` and points to the new canonical address so existing links are not stranded. It is excluded from the sitemap.

Rendered verification confirmed that the legacy local route immediately resolves to `/life-os/flagships/curated-100/`, preserves the query string, produces the new canonical URL, and has no browser console errors or horizontal overflow.

## Editorial review item

One existing hack slug exceeds 60 characters:

- `cognitive-biases-how-to-when-safety-increases-assess-risks-ask-am-i` (67 characters)

It is descriptive rather than technical and remains under the hard 80-character limit. It was retained to avoid breaking a stable protocol identity without a dedicated alias migration. The automated check keeps it visible as an editorial review item.

## Ongoing guardrail

`scripts/check-slug-quality.mjs` now runs automatically before `npm run check`. It rejects:

- missing or duplicate slugs;
- numeric-only slugs;
- generic technical IDs;
- UUIDs and opaque hashes;
- invalid lowercase/kebab-case shapes;
- slugs over 80 characters;
- missing public entry pages;
- numeric-only, technical-ID, UUID, or hash terminal segments in public canonical URLs.

Run it directly with `npm run slugs:check`.
