# Brali Growth Library content quality

The Growth Library is product content, not an SEO page factory. Public guidance should be useful when read by a person and defensible when read by a search engine, reviewer, or AI system.

## Evidence states

Every entry has one explicit state:

- `reviewed`: evidence-like claims have traceable sources and the practical guidance has been checked.
- `practical`: the entry is a low-risk personal practice and contains no evidence-like claim that requires support.
- `pending-review`: a source is recorded or evidence-like wording exists, but editorial review is not complete.
- `restricted`: sensitive health or mental-health guidance does not yet meet the evidence bar.

The default state is derived automatically. Manual editorial decisions live in `data/evidence-overrides.json` and must include `reviewed_at` and `reviewed_by`.

## Review workflow

1. Run `npm run build` to generate `life-os/datasets/evidence.json` and `life-os/datasets/review-queue.json`.
2. Work through `restricted` entries first, then `pending-review`; quantitative claims are prioritized within each state.
3. Check the source and the wording. Remove unsupported precision instead of searching for a citation that merely looks convenient.
4. When a decision is complete, add an override with `status`, `reviewed_at`, `reviewed_by`, and an optional `note`.
5. Run `npm run check`. Invalid overrides, evidence-state drift, missing protocol summaries, and indexing-policy drift fail the build.

A `practical` override is rejected while evidence-like claims remain. A sensitive or evidence-claiming entry cannot be marked `reviewed` without a usable source.

## Editorial normalizations

The migrated source corpus is preserved for provenance, so inherited boilerplate can remain in repository source files even after editorial review identifies a problem. Reviewed corpus-wide corrections live in `data/editorial-normalizations.json`.

A normalization must record:

- the exact inherited wording being corrected;
- the replacement wording;
- the reason for the change;
- the review source used to evaluate the inherited claim;
- `reviewed_at` and `reviewed_by`.

Reviewed normalizations are applied before public pages, evidence states, search indexing, and the Trusted Protocol Feed are generated. The applied-rule register is published as `life-os/datasets/editorial-normalizations.json` so the correction is visible rather than silently rewriting history.

Use this mechanism for genuinely repeated inherited claims. Do not use it to make article-specific editorial decisions look like generic rules.

## Claims

Precise claims require precise support. Percentages, sample sizes, effect estimates, phrases such as "research shows", and claims about treatment, diagnosis, prevention, or clinical outcomes require a source that a reader can trace.

When a source is unavailable, prefer a modest practical statement over scientific-sounding language. Do not invent a study-shaped explanation to make a recommendation look authoritative.

## Editorial voice and teaching

Brali should not read like a database wearing a blog costume. A protocol is also a small lesson: the reader should leave knowing what to try, why the move is plausible, what signal to watch, and where the evidence stops.

Use these rules for new material and when revising the inherited library:

1. **Explain the move before the terminology.** Start with the human problem and the mechanism in plain language. Introduce technical terms only when they make the idea clearer or more precise.
2. **Teach the boundary, not just the result.** A useful evidence section says what the source supports, what it does not support, and why that distinction changes the action.
3. **Prefer a concrete contrast.** "Walk while generating options; sit down when you switch to evaluation" teaches more than "walking improves creativity." Concrete examples should illuminate the mechanism rather than manufacture fake certainty.
4. **Let the reader run an experiment.** Give a smallest useful version, a review horizon when one is justified, an observable signal, and explicit keep/change/stop logic.
5. **Sound like a thoughtful person.** Clear, compact, conversational language is preferred over corporate prose, generic AI voice, SEO filler, and motivational wallpaper.
6. **Dry humor is allowed; contempt is not.** Mild sarcasm can target pseudoscientific theatre, magic timers, unsupported certainty, or productivity rituals. Never mock the reader, vulnerable people, safety concerns, failed attempts, or scientific uncertainty.
7. **No neuroscience confetti.** Words such as dopamine, cortisol, neural pathways, or brain rewiring do not make weak advice scientific. Use mechanism claims only when the reviewed source actually supports them.
8. **Do not turn every finding into a commandment.** If a study tested one context, present a bounded experiment for that context. A sample size is not a license to write a universal law.
9. **Keep provenance visible.** A more interesting voice must never erase source traceability, limitations, evidence state, or safety exclusions.

A good Brali paragraph often follows this rhythm: **what is happening → why the usual approach fails → what to try → what to notice → what would make us change our mind.** The goal is not to sound scientific. The goal is to help the reader think scientifically without making the reading painful.

## Health and mental health

Health and mental-health entries receive the highest review priority. Until the evidence bar is met, keep them out of search indexing, frame them as general education rather than medical advice, and avoid diagnosis or treatment promises.

## Structure of a strong protocol

A strong Brali entry should answer:

1. What problem is this for?
2. What should I try?
3. How small can the first action be?
4. How long should I try it before reviewing?
5. What should I observe or record?
6. What would make me keep, change, or stop it?
7. What evidence supports any factual claim?
8. Are there safety limits or contexts where this is not appropriate?
9. Can a non-specialist explain the mechanism back after reading the page?
10. Does the page state where the evidence ends instead of quietly turning a finding into a universal rule?

## Brand and provenance

Public pages use Brali branding. Historical MetalHatsCats URLs and names may remain in archived source records for provenance, but they must not leak into generated public pages and they do not count as evidence.

## Search policy

Indexing is earned by content quality, not by the existence of a generated URL.

- `reviewed` and eligible `practical` entries may be indexed, included in the sitemap, and offered through normal trusted recommendations.
- `pending-review` and `restricted` entry URLs remain directly accessible for provenance and review, but must be `noindex,follow`, must not appear in the sitemap, and must not enter the Trusted Protocol Feed or normal recommendations.
- Related-protocol recommendations may point only to indexable entries.
- A canonical human protocol page remains the primary search surface. Machine records, API views, and Brali Skill Packs are reusable representations of the same identity; they must not create thin duplicate SEO pages for every format.
- Sitemap membership, indexing, ranking, AI citation, recommendation traffic, and protocol usefulness are separate states. Repository checks may prove implementation parity but must not claim external search outcomes.

This deliberately favors a smaller trusted search surface over a large collection of unreviewed pages.

## Reusable Brali Skill Packs

A trusted protocol may expose a portable `SKILL.md`-style pack for AI tools and agent workflows. The pack is derived from the canonical trusted record rather than maintained as a second copy of the advice.

- Only records already eligible for the Trusted Protocol Feed may be offered as skill packs.
- The pack must preserve the canonical ID/URL, evidence state, action, check-in, source boundary, attribution, and important guardrails.
- A review-gated record must not become reusable simply because its public URL is crawlable.
- Tool-specific installation support must be described accurately. A downloadable or copyable instruction file is not evidence of universal one-click installation.
- Skill-pack availability is a product capability, not a search-ranking or AI-recommendation claim.

## Machine-readable outputs

- `life-os/datasets/evidence.json` exposes the evidence state for every Growth Library entry.
- `life-os/datasets/review-queue.json` exposes the current editorial queue.
- `life-os/datasets/indexing.json` lists which entries meet the current search-indexing bar and which remain review-gated.
- `life-os/datasets/protocols.json` provides the compact discovery-ready Trusted Protocol Feed and is the catalog source for Brali Skill Packs.
- `life-os/datasets/editorial-normalizations.json` records reviewed inherited-claim corrections and their application counts.
- `life-os/datasets/manifest.json` includes evidence, indexing, protocol-feed, and normalization counts.

These files are public so search systems, AI tools, and contributors can distinguish reviewed material from content still awaiting review.
