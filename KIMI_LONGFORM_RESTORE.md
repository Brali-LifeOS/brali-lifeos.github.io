# Kimi K3 handoff — restore Brali long-form articles

## Mission

Continue the existing long-form restoration work on Brali. Do not restart from `main` and do not replace the current work with a new architecture.

Repository:
`https://github.com/Brali-LifeOS/brali-lifeos.github.io`

Working branch:
`deep-run/restore-longform-articles-2026-09-16`

Open PR:
`#280 Restore long-form hack articles and article versions`

Tracking issue:
`#279 Restore long-form hack articles with visible revision history`

## User intent

When a human opens a Brali hack, the page should contain the substantial migrated article, not only a short summary/review card.

The old Metalhatscats-era long-form corpus is valuable editorial content. Do not hide it merely because review is pending. Refresh, correct and expand it where needed. Keep article depth.

Every article should end with a visible article/revision history so later refreshes are inspectable.

Important distinction:

- visible long-form article != trusted recommendation;
- visible long-form article != reviewed evidence;
- search eligibility != trusted recommendation;
- Agent Skill eligibility remains governed by evidence/trust state.

Do not silently promote unreviewed claims to reviewed evidence.

For safety-sensitive/restricted content, preserve the historical article for human inspection when it can be displayed safely, but clearly label it as unreviewed/restricted, keep `noindex,follow`, keep it out of trusted recommendations and usable skills, and remove/rewrite dangerous operational instructions or unsupported medical/clinical claims rather than presenting them as current advice.

## Start exactly here

```bash
git clone https://github.com/Brali-LifeOS/brali-lifeos.github.io.git
cd brali-lifeos.github.io
git fetch origin
git checkout deep-run/restore-longform-articles-2026-09-16
git pull --ff-only origin deep-run/restore-longform-articles-2026-09-16
```

If the repo already exists locally:

```bash
cd <repo>
git fetch origin
git checkout deep-run/restore-longform-articles-2026-09-16
git pull --ff-only origin deep-run/restore-longform-articles-2026-09-16
```

Do not create another implementation PR while #280 is active. Push fixes to this branch.

Before changing code, read:

1. `AGENTS.md`
2. `README.md`
3. `docs/REPOSITORY_MAP.md`
4. `SOURCE_POLICY.md`
5. `CONTENT_QUALITY.md`
6. `AGENT_LOOP.md`
7. issue #279 and PR #280 diff/status

## What has already been implemented on this branch

The branch already contains the first restoration layer. Inspect the actual diff before editing.

Expected changes include:

- a build helper restoring canonical `body.markdown` into generated article HTML when no curated `body.sections` replacement exists;
- `pending-review` long-form content remaining visible instead of being collapsed to a neutral short review card;
- a visible `Article versions` / revision section at the bottom of hack pages;
- machine state separating `longform_visible`, `current_guidance`, search eligibility and recommendation eligibility;
- content policy updated so shortening is not a substitute for review;
- build/check invariants intended to prevent silent disappearance of Markdown-backed long-form content.

Do not assume this implementation is correct just because files exist. Reconstruct the current branch truth and validate it.

## Core technical problem

There are two separate historical loss mechanisms.

### 1. Markdown was not rendered by the primary generator

Many migrated articles store the substantive article in:

```json
body.markdown
```

while `scripts/build-life-os.mjs` historically rendered primarily:

```text
body.intro.html
body.sections[]
```

A rebuild could therefore turn a large article into only its short description even though the source JSON still contained the full text.

### 2. The trust sanitizer intentionally removed long-form content

`scripts/sanitize-generated.mjs` previously converted non-trusted records into `historical-source-only` pages and removed inherited prose.

This behavior must no longer erase substantive article content merely because a record is `pending-review`.

## Required end state

For every canonical hack record in `data/life-os-content/index.json`:

### Reviewed / practical

- substantive article visible;
- current-guidance label is allowed;
- normal evidence/source section;
- search/indexing according to existing trusted policy;
- trusted recommendation/skill eligibility governed by existing rules;
- visible article revision history at bottom.

### Pending-review, non-sensitive

- substantive long-form article visible;
- prominent `Pending review` / unreviewed evidence boundary;
- no language implying review is complete;
- may be search-indexable according to policy;
- must remain outside Trusted Protocol Feed and trusted recommendations;
- usable Agent Skill eligibility must remain false;
- visible article revision history at bottom.

### Pending-review, safety-sensitive

- substantive educational/historical article can remain visible when safe;
- explicit safety/review boundary;
- `noindex,follow` until the evidence/safety bar is met;
- outside trusted recommendations and usable skills;
- remove/rewrite unsafe operational directions and unsupported clinical/medical claims rather than hiding the whole article;
- preserve source/provenance and revision history.

### Restricted

Do not automatically turn restricted material into actionable guidance. The goal is preservation without unsafe promotion.

Preferred outcome:

- keep the long-form historical/editorial text inspectable when it can be presented safely;
- display a strong restricted/unreviewed banner;
- `noindex,follow`;
- no trusted recommendation;
- no usable Agent Skill;
- dangerous, prescriptive, treatment-like, diagnostic or unsupported high-stakes instructions must be removed, neutralized, or rewritten before public rendering;
- preserve canonical source/provenance and revision history.

If a restricted page cannot safely expose its operational text without a real editorial/source review, keep the unsafe operational portion withheld but do not delete the source record. Record that exception deterministically.

## Corpus restoration loop

Work autonomously in a loop:

1. inspect current branch truth;
2. run build/check and capture failures;
3. inventory canonical content shapes across all hacks (`body.markdown`, `body.intro`, `body.sections`, description-only, curated overrides);
4. compare canonical source size/content against generated HTML;
5. find pages where meaningful source content disappeared or is materially truncated;
6. fix the owning generator/policy rather than hand-editing generated pages;
7. rebuild;
8. inspect representative pages from each content shape and evidence state;
9. repair regressions;
10. repeat until the corpus-level restoration gate is clean.

Do not stop after fixing one sample page.

## Build a real restoration audit

Create or strengthen a deterministic corpus report, preferably under `life-os/datasets/`, that exposes at least:

- slug;
- canonical source content shape;
- canonical source substantive character/word count;
- generated human-visible article character/word count;
- evidence state;
- sensitive/restricted status;
- long-form visible yes/no;
- current-guidance yes/no;
- reason for any intentional withheld portion;
- revision/version block present yes/no.

Add a CI gate that fails when a substantive canonical article unexpectedly becomes a thin generated page.

Do not use a naive minimum word count for all records. Compare generated output to the actual canonical source and content shape. Curated concise replacements can legitimately be shorter when explicitly reviewed and recorded.

## Version history requirement

Every hack page should end with a visible, compact revision section such as:

- Original / migrated publication date when known;
- Current canonical content revision (`meta.updatedISO` or equivalent);
- Latest evidence/editorial review date when known;
- state (`reviewed`, `practical`, `pending-review`, `restricted`);
- canonical source record link;
- optionally a short reason/registry identifier for a curated replacement.

Do not invent dates. Do not claim a review happened when only a build ran.

If existing metadata is insufficient, add a stable canonical metadata structure rather than generating fake history from Git timestamps.

## Editorial refresh rules

When old content contains weak or stale material:

- keep useful explanations, examples, structure and practical teaching;
- remove fake precision and unsupported percentages/timings/effect sizes;
- replace outdated product CTA references;
- update terminology and current Brali positioning;
- attach real sources to evidence-like claims;
- narrow claims when evidence is mixed;
- preserve negative/uncertain evidence;
- do not manufacture scientific language;
- do not compress a useful article merely to make validation easier.

Use existing editorial normalization/review/override mechanisms where they fit. Do not create an uncontrolled second source of truth.

Correct public maintainer/attribution spelling is `Metalhatscats` where that maintainer identity is required. Do not introduce `MetalHeadsCats`, `MetalHeadCats`, `metalheadscats`, or other variants.

## Key files to inspect

At minimum:

- `scripts/build-life-os.mjs`
- the long-form restore helper added by PR #280
- `scripts/sanitize-generated.mjs`
- `scripts/lib/content-trust.mjs`
- `scripts/build-evidence-index.mjs`
- `scripts/apply-indexing-policy.mjs`
- `scripts/check-indexing-policy.mjs`
- `scripts/check-site.mjs`
- `scripts/audit-content.mjs`
- localization build/check scripts
- `scripts/apply-protocol-content-overrides.mjs`
- `scripts/apply-editorial-normalizations.mjs`
- `data/life-os-content/index.json`
- representative source records in `data/life-os-content/*.json`
- `CONTENT_QUALITY.md`

Search the entire repository for stale assumptions including:

```text
historical-source-only
Review record:
withhold inherited long-form
inherited long-form guidance remains hidden
pending-review-reference
neutral review record
```

Do not trust GitHub code search alone if it is unavailable/incomplete; use local ripgrep/grep.

## Representative pages that must be inspected

Include at least:

- a very large Markdown-backed migrated article such as `10x-goal-sprints-tracker`;
- a curated reviewed `body.sections` article such as `if-then-rules-productivity`;
- a low-risk practical article;
- a non-sensitive pending-review article;
- a sensitive pending-review article;
- a restricted article;
- RU and DE localized representatives after the English source/build contract is stable.

For each representative page, inspect final HTML, not only JSON.

## Localization

Do not solve English restoration by breaking Russian or German parity.

After canonical long-form behavior is correct:

- inspect how RU/DE pages source/render long-form content;
- preserve locale-specific authored translations where they exist;
- do not silently fall back to English on a localized long-form page if the locale contract forbids it;
- keep hreflang/canonical and evidence state parity;
- run the full localization gates.

## Verification commands

Run focused checks while iterating, then the complete gate.

```bash
npm install
npm run build
npm run check
npm run localization:check
```

Also use relevant focused scripts/checks for the changed restoration/audit logic.

Inspect `git diff` after `npm run check`; repository checks may modify generated state.

Before pushing final fixes:

```bash
git status
git diff --check
```

Commit meaningful slices; do not commit random caches or local artifacts.

Push to the existing branch:

```bash
git push origin deep-run/restore-longform-articles-2026-09-16
```

Do not force-push over unknown remote work. Fetch first and rebase/merge carefully if the branch moved.

## CI / merge rule

PR #280 is the implementation PR. Keep it as the single active implementation PR for this slice.

The work is not done until:

- exact PR HEAD passes the canonical GitHub Actions build/check workflow;
- corpus restoration report/gate is clean;
- representative final HTML pages show restored long-form content and versions;
- trusted recommendation/Agent Skill boundaries remain intact;
- restricted/high-stakes content is not accidentally promoted;
- localization checks pass;
- generated diff is reviewed for accidental mass deletion/truncation.

If all required checks are green and the diff is safe, the PR may be merged to `main` under the user's explicit authorization for this restoration loop.

After merge, inspect the deployed production pages and continue the loop if any canonical article still renders thin.

## Do not do

- Do not delete the old long-form corpus to make checks green.
- Do not replace 947 articles with generic AI filler.
- Do not treat `pending-review` as `reviewed`.
- Do not weaken source/safety rules simply to increase the trusted count.
- Do not hand-edit hundreds of generated `life-os/<slug>/index.html` pages as source.
- Do not create a second parallel content database.
- Do not invent publication/review dates, usage, traffic, or evidence.
- Do not stop because one sample page looks correct.

## Completion summary expected from Kimi

Report:

1. exact final commit SHA;
2. PR #280 status;
3. total hacks inspected;
4. number with substantive long-form source;
5. number restored to visible long-form;
6. number intentionally partially/fully withheld for safety, with reasons;
7. representative before/after pages;
8. build/check/localization results;
9. remaining corpus/editorial debt;
10. whether PR #280 was merged and production verified.
