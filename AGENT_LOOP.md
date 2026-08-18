# Brali agent loop

## Goal

Make Brali the most trustworthy and practical local-first system for turning useful ideas into personal experiments.

The project should optimize for four things, in this order:

1. Trust: claims are sourced, sensitive guidance is handled conservatively, and legacy branding does not leak into public pages.
2. Clarity: a new visitor can understand the product loop in seconds: choose -> practice -> review.
3. Usefulness: Growth Library entries become executable protocols rather than long generic articles.
4. Discovery: search engines and AI systems can understand the product, taxonomy, evidence, and public datasets without rewarding low-quality page volume.

## Loop

Each iteration follows the same sequence:

1. Inspect
   - Review current public pages, generated content, search/indexing signals, and repository checks.
   - Prefer evidence from the repository and deployed site over assumptions.

2. Prioritize
   - Fix P0 trust and safety problems before adding features or more content.
   - Prefer changes that improve many pages through generators, schemas, or validation instead of manual one-page edits.

3. Change
   - Keep the static-site architecture simple.
   - Make small reversible changes on an agent branch.
   - Do not increase indexed page count unless the content-quality bar is met.

4. Validate
   - Run build and site checks.
   - Run the content audit in strict mode.
   - Block deployment when legacy branding leaks into generated pages or unsourced sensitive pages remain indexable.

5. Review
   - Check whether the change improves trust, comprehension, activation, or discovery.
   - Record remaining risks instead of hiding them behind polished copy.

6. Continue
   - Pick the next highest-leverage item from the queue below.

## Priority queue

### P0 - Content trust

- Remove legacy MetalHatsCats branding from generated public pages.
- Protect unsourced health and mental-health entries from indexing until review.
- Add explicit sources/evidence fields to the Growth Library data model.
- Review unsupported percentages, sample sizes, research claims, and medical-sounding promises.
- Add source-review status and reviewed-at metadata.

### P1 - Product clarity

- Position Brali around the choose -> practice -> review loop.
- Replace generic LifeOS language with concrete examples of personal experiments.
- Show real product screens and the path from a library entry to action and review.
- Make the Growth Library a primary product surface, not an SEO appendix.

### P2 - Information architecture

- Keep the 49 Growth Zones as detailed taxonomy.
- Add a smaller set of human-friendly top-level life areas for navigation.
- Add related protocols, method tags, evidence filters, and practical search.
- Separate methods such as CBT, Stoicism, TRIZ, and Game Theory from broad life areas where useful.

### P3 - Search and AI discovery

- Improve Article and collection structured data with author, publisher, breadcrumbs, and review metadata.
- Add sitemap lastmod values where reliable.
- Keep llms.txt and machine-readable product facts aligned with public claims.
- Prefer fewer strong indexed protocol pages over mass generation of thin or weakly sourced pages.

## Definition of done for an indexed Growth Library entry

An entry should be indexable only when it has:

- a clear problem or use case;
- a concrete action or protocol;
- a realistic check-in or metric;
- no unsupported precise quantitative claims;
- sources for evidence-like claims;
- an explicit safety note when the topic is health-related;
- current Brali branding;
- useful internal links and canonical metadata.

## Non-goals

- Becoming another generic all-in-one productivity app.
- Producing more pages only to increase sitemap size.
- Using scientific language to make weak guidance sound authoritative.
- Adding framework complexity without a clear user or maintenance benefit.
