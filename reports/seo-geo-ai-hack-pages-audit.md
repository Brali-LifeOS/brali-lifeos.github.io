# SEO, GEO, and AI discovery audit for Brali hack pages

Date: 2026-08-22

## Outcome

The public Growth Library now separates web discovery from trusted recommendation:

- 947/947 public hack pages are crawlable and included in `sitemap.xml`.
- 0 hack pages carry `noindex`.
- 139 reviewed or low-risk practical entries remain eligible for normal trusted recommendations.
- 808 pending-review or restricted entries remain public and evidence-labelled, but stay outside the Trusted Protocol Feed and normal AI recommendations.
- Every hack page exposes a visible non-commercial AI-use block, per-page JSON, integration instructions, citation guidance, and licensing terms.

## What changed

### SEO and answer-engine discovery

- Removed `noindex` from every public hack and Growth Zone page.
- Added every public hack and zone to the sitemap while preserving reliable `lastmod` values where available.
- Kept canonical URLs, descriptive metadata, breadcrumbs, one H1, semantic text, and trusted internal links.
- Added `og:site_name`, article section and publication metadata, Twitter summary metadata, and a machine-readable license link.
- Kept related recommendations restricted to reviewed/practical entries: 2,841 contextual internal links across 947 pages.

Google states that AI search features use the same SEO foundations as ordinary Search and do not require special GEO schema or AI-only markup. The useful levers are index eligibility, crawlability, textual content, internal links, page experience, and structured data that matches visible content: [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features), [generative AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

### AI and agent usability

- Added a final “Use this hack with AI agents and apps” block to every hack page.
- Linked each page directly to its `/index.json` record, `/for-ai/integrations/`, `/cite/`, and `/terms/`.
- Enriched the existing `Article` and `WebPage` JSON-LD with `license`, `usageInfo`, `isAccessibleForFree`, language, article section, and the per-page JSON encoding.
- Explicitly allow `OAI-SearchBot` and `ChatGPT-User` in `robots.txt` so public pages can be found and used interactively.
- Block `GPTBot`, aligning crawler behavior with the repository’s non-commercial public license and separate-permission rule for commercial AI training.

OpenAI documents that `OAI-SearchBot` controls inclusion in ChatGPT search while `GPTBot` is the crawler publishers can block for potential training: [Publishers and Developers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq).

### Trust and licensing

- The visible reuse block states the CC BY-NC-SA 4.0 non-commercial boundary, attribution requirement, evidence-state preservation, change indication, share-alike requirement, and separate commercial-permission path.
- The same license and usage boundary is present in machine-readable schema.
- Pending-review and restricted pages visibly retain their status and do not enter the trusted protocol feed.
- Reviewed citations remain source-gated; no source URL is promoted merely because a page is public or indexable.

Schema.org defines `usageInfo` as a companion to `license` for citation expectations and alternative commercial licensing paths: [usageInfo](https://schema.org/usageInfo).

## Current risk and highest-value next work

Full indexing increases crawlable coverage, but it does not guarantee ranking or AI citation. The largest remaining risk is content quality, not technical discovery:

- 658 entries carry unresolved claim debt.
- 653 entries are pending review.
- 155 entries are restricted.
- 237 entries still need a canonical Topic assignment.

The highest-value growth sequence is therefore:

1. Rewrite or source the highest-demand pending pages before creating more URLs.
2. Move strong pages from pending/restricted to reviewed or practical only after the evidence decision supports it.
3. Use Search Console queries to prioritize editorial work by impressions and near-page-one positions.
4. Measure clicks from hack pages to integration instructions, per-page JSON, citation guidance, and related trusted protocols without inventing usage claims.
5. Create page-specific social images for the strongest reviewed/practical pages; the current shared logo is valid but not differentiated.

## Verification

- `npm run build` passed.
- Full `npm run check` passed with an isolated temporary npm cache; the default user npm cache has unrelated root-owned files.
- Deterministic checks confirm 947/947 hack pages are indexable, in the sitemap, machine-readable, licensed, and linked to AI integration instructions.
- Playwright desktop (1440×900) and mobile (390×844) checks passed with zero console errors or warnings.
