# Brali agent loop

## Goal

Make Brali the most trustworthy and practical local-first system for turning useful ideas into personal experiments.

Optimize for four things, in this order:

1. Trust: claims are defensible, sensitive guidance is conservative, and discovery never outruns review.
2. Clarity: a new visitor understands the product loop quickly: choose -> practice -> review.
3. Usefulness: Growth Library entries behave like executable protocols rather than a pile of long articles.
4. Discovery: people, search engines, and AI tools can find the strongest material without rewarding weak page volume.

## Loop

Each iteration follows the same sequence:

1. Inspect
   - Review repository outputs, content-quality datasets, current public pages when reachable, and search/indexing signals.
   - Prefer generated evidence over assumptions.

2. Prioritize
   - Fix trust and editorial problems before adding more content volume.
   - Prefer changes that improve many entries through data models, generators, or checks.

3. Change
   - Keep the static-site architecture simple and local-first.
   - Make small reversible changes on an agent branch.
   - Preserve canonical URLs and source records unless a migration explicitly requires otherwise.

4. Validate
   - Run the deterministic build and strict repository checks.
   - Evidence state, `noindex`, sitemap membership, related recommendations, Protocol Feed membership, structured data, titles, and public trust pages must agree.

5. Review
   - Look for ways the change could accidentally overstate evidence, hide provenance, break discovery, or make the product harder to understand.
   - Do not treat a recorded source as reviewed evidence.

6. Continue
   - Pick the next highest-leverage unfinished item below.

## Foundation completed on 2026-08-18

The following are now infrastructure, not backlog items:

- Brali positioning is centered on personal experiments and the `choose -> practice -> review` loop.
- Legacy MetalHatsCats branding is removed from generated public pages.
- Every Growth Library entry receives a compact Protocol Summary with action, check-in, and evidence state.
- Evidence states are explicit: `reviewed`, `practical`, `pending-review`, and `restricted`.
- Manual editorial decisions are traceable through `data/evidence-overrides.json`.
- Only `reviewed` and `practical` entries earn sitemap/search discovery; other entries remain available with `noindex,follow`.
- Seven human-friendly Life Areas sit above the 49 detailed Growth Zones.
- Malformed public titles are normalized without destroying original source titles.
- Article structured data includes publisher, breadcrumbs, canonical entity relationships, and reliable `lastmod` values.
- Related-protocol links form a trust-aware internal graph and recommend only discovery-eligible entries.
- The Growth Library has local client-side search filtered by the evidence/indexing model.
- A compact Trusted Protocol Feed is available for AI tools and integrations.
- A public Content Methodology page explains the evidence and indexing rules using generated counts.
- CI checks enforce the trust, indexing, related-link, feed, title, search, and structured-data contracts.

## Current priority queue

### P0 - Editorial evidence review

This is now the most important work. Infrastructure can detect weak content; it cannot replace source review.

- Work through `life-os/datasets/review-queue.json`, `restricted` first.
- Prioritize unsupported percentages, sample sizes, clinical-sounding outcomes, and phrases such as `research shows`.
- For each reviewed entry, verify the external source actually supports the wording.
- Remove unsupported precision instead of attaching a vaguely related citation.
- Record `reviewed_at`, `reviewed_by`, and a short review note in `data/evidence-overrides.json`.
- Review generic FAQ claims such as habit-formation timelines and other repeated assertions inherited across many entries.

### P1 - Stronger protocol content

- Identify a smaller set of flagship protocols in each Life Area.
- Make the first screen answer: problem, action, check-in, duration/review point, and stop/change rule.
- Reduce reliance on multi-thousand-word background articles where a compact protocol is sufficient.
- Preserve useful deep background as optional detail rather than forcing it before the action.
- Add explicit review horizons where the source material supports them.

### P2 - Taxonomy refinement

- Keep all existing Growth Zone URLs stable.
- Separate broad life areas from method lenses more clearly. CBT, Stoicism, TRIZ, Game Theory, Gestalt, and similar methods should increasingly behave like methods/tags rather than peer life destinations.
- Improve method tags and cross-area relationships using the existing Protocol Feed.
- Review ambiguous or low-value zone names inherited from the old taxonomy.

### P3 - Product proof and activation

- Add authentic in-app screenshots only when real captures are available; do not simulate screenshots.
- Show the real path from a Growth Library protocol to action/check-in/review in the application.
- Keep store naming, Brali branding, privacy wording, and website claims aligned.
- Improve the getting-started path around one first experiment rather than module setup.

### P4 - Discovery monitoring

- Monitor recrawl/index coverage after the earned-indexing migration.
- Compare indexed URLs with `life-os/datasets/indexing.json` rather than aiming for maximum page count.
- Watch which Life Areas and protocol queries produce impressions before expanding content.
- Keep `llms.txt`, `product-facts.json`, the Protocol Feed, methodology page, and structured data synchronized.
- Add new indexed content only when it meets the same evidence and protocol-quality bar.

## Definition of done for an indexable Growth Library entry

An entry is discovery-eligible only when it is `reviewed` or `practical` and has:

- a clear problem or use case;
- a concrete action or protocol;
- a realistic check-in or observable signal;
- no unsupported precise quantitative claims;
- traceable sources for evidence-like claims when sources are required;
- an appropriate safety framing for sensitive topics;
- current Brali branding;
- a useful public display title;
- canonical and structured metadata;
- related links that point only to discovery-eligible material.

## Non-goals

- Becoming another generic all-in-one productivity app.
- Increasing sitemap size as a success metric.
- Using scientific language to make weak guidance sound authoritative.
- Treating a source URL as proof that review happened.
- Inventing app screenshots or features that are not in the shipped product.
- Adding framework complexity without a clear user, editorial, or maintenance benefit.
