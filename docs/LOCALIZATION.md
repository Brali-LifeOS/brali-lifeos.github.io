# Localization release contract

Russian (`ru`) is Brali's reference human-interface localization. It is a reference implementation, not a template to copy blindly: locale-independent rules live in `.arwp/localization.json` and `scripts/lib/localization-contract.mjs`; language-specific editorial policy remains a locale plug-in.

## Invariants

1. English (`en`) remains the canonical source locale. Localized content never rewrites canonical evidence, provenance, source URLs, review dates or stable identities.
2. Localization quality and canonical evidence state are separate dimensions. A strong translation cannot promote weak evidence; strong evidence cannot make draft localization reviewed.
3. A published human-interface locale must have exact membership for every surface declared `exact`, and exact full-corpus membership where the release contract requires it.
4. Human fallback must be explicit. A localized page may link to an English-only secondary surface only when the link itself declares the English language boundary. Do not silently render English under a localized route.
5. Generated files are derived artifacts. Edit the locale datasets, registry, generators or validators that own them.
6. Search and AI surfaces are part of the locale release: `lang`, canonical, reciprocal `hreflang`, sitemap, structured-data language, locale manifest, machine-readable library and `llms.txt` must agree.
7. Green source checks are necessary but insufficient. A published locale also requires a post-deploy real-browser pass.
8. Translation presence never grants search eligibility. A localized route inherits the canonical source page's search eligibility; restricted/noindex canonical records stay generated and usable in every locale but remain `noindex,follow` and outside search sitemaps.

## Locale registry

Every locale is registered in `.arwp/localization.json`.

A human-interface locale must declare:

- `code` — stable BCP-47-compatible locale key used by the repository;
- `languageTag` — language tag emitted to browser/machine surfaces;
- `label` — native switcher label;
- `direction` — `ltr` or `rtl`;
- `routePrefix` — `/<code>/`;
- `datasetRoot` — `data/localization/<code>`;
- `role` — `human-interface`;
- `status` — `draft`, `reviewed-partial` or `published`;
- `requiredGates` — executable release gates for the implementation;
- `releaseProof` — proof classes already satisfied by a published release.

Locale codes, route roots and dataset roots must be unique. The canonical locale owns `/`.

## Release states

### `draft`

Structure may be incomplete. It must not masquerade as complete search or machine coverage.

### `reviewed-partial`

Declared surfaces have meaningful reviewed localization, but explicit debt or release proof is still missing. Missing coverage and English-only boundaries must remain visible.

### `published`

Use only when all of these proof classes are green:

- `contract` — locale registry and generic contract validation;
- `corpus` — declared exact membership and source freshness;
- `language` — deterministic leakage scan plus editorial review/exception registry;
- `rendered` — generated HTML/UI/static invariants;
- `browser` — deployed Chromium corpus scan, representative screenshots, keyboard and accessibility snapshots;
- `live` — deployed HTTP, canonical/hreflang/sitemap/machine-surface parity.

## Adding a language

Do not begin by copying the `ru` build scripts. Add the locale to the registry first, then implement only the language-specific adapter that cannot be generic.

Recommended sequence:

1. Register the locale with `status: draft`, route prefix, dataset root, direction and native label.
2. Create `data/localization/<locale>/` with an explicit site/UI vocabulary, glossary baseline and source-linked authoring data.
3. Reuse stable canonical slugs/IDs. Never mint localized identities for canonical records.
4. Build coverage from the canonical source snapshot plus the same build-time additions used by production.
5. Preserve evidence/provenance fields from canonical data; localize presentation fields only.
6. Implement a language audit plug-in: NFC/Unicode rules, natural-language heuristics, suspect-term scan, and a narrow exception registry for real names/technical identifiers.
7. Generate localized HTML, manifest, sitemap, machine library and `llms.txt` from the locale registry. Avoid hard-coded locale URLs in new generic code.
8. Add exact source/render checks and all required negative tests before moving beyond `draft`.
9. Run build + repository checks in PR CI.
10. Deploy the merged SHA and run the HTTP live gate plus real-browser gate against production.
11. Upgrade to `published` only after the deployed SHA satisfies every release proof class and the locale debt ledger has no release-blocking item.

## Mandatory adversarial tests

A localization validator must reject at least:

- missing localized slug under exact coverage;
- empty required title;
- duplicate localized slug;
- invalid localization quality value;
- non-authoritative localized record;
- unknown canonical/source ID;
- null required field;
- stale or mismatched source snapshot;
- unreviewed English leakage.

`scripts/check-localization-faults.mjs` is the executable baseline for these failures.

## Russian editorial audit

Russian source text is scanned by `scripts/audit-ru-language.mjs`. The scan covers library batches, flagships, zones, primary-page metadata and site UI data. Terms that are likely untranslated leakage or avoidable calques fail the build.

If an original-language term is genuinely required because it is a proper name, formal method name, identifier or clearer technical token, add the smallest possible location-specific exception to `data/localization/ru/language-allowlist.json` and record the reason. A broad wildcard exception is not a substitute for editing.

## Indexability contract

`indexability.json` is the generated machine-readable inventory of URLs that are eligible for search publication. It is not an authored URL list. `scripts/build-indexability-registry.mjs` derives it from the canonical HTML search state, the root sitemap, the locale manifests and `localization-cluster.json`.

An index-eligible localized URL must satisfy all of these conditions:

1. its canonical source page exists and is self-canonical;
2. the canonical source page is not `noindex`;
3. the canonical source URL is present in the canonical root sitemap;
4. the localized route exists in the released locale manifest;
5. the generated localized page is self-canonical and uses the correct `html lang`;
6. the localized page is not `noindex`;
7. reciprocal locale relationships come from the shared localization cluster;
8. the localized URL appears in the locale sitemap and root aggregate sitemap;
9. the URL is reachable through a normal crawlable HTML link from another index-eligible page.

Routes that fail the canonical search-eligibility decision are still allowed to exist as useful human routes. They are explicitly marked `index_eligible: false` in the generated locale manifest, publish `noindex,follow`, and must be absent from the locale sitemap, root sitemap and `indexability.json`. This keeps full EN/RU/DE content parity separate from search-publication parity.

The sitemap architecture intentionally stays simple:

- `https://brali-lifeos.github.io/sitemap.xml` is the aggregate production sitemap and the primary Search Console submission endpoint;
- `https://brali-lifeos.github.io/ru/sitemap.xml` is the generated Russian index-eligible subset;
- `https://brali-lifeos.github.io/de/sitemap.xml` is the generated German index-eligible subset;
- `robots.txt` advertises release-locale sitemaps;
- sitemap `hreflang` and HTML `hreflang` are derived from the same localization cluster rather than independently maintained tables.

`scripts/check-indexability-contract.mjs` fails the build for route collisions, stable-ID collisions, missing generated pages, route-level search-policy drift, sitemap leakage or omission, wrong language/canonical state, malformed or stale `hreflang`, broken crawlable links/fragments, and index-eligible orphan pages. `scripts/normalize-search-sitemap.mjs` rebuilds and re-runs this contract against the exact final sitemap immediately before the final Pages artifact gates.

A future locale should therefore need only registry registration, valid localized source data and the generic build path. Canonicals, alternates, manifest search eligibility, locale sitemap entries, aggregate sitemap membership, machine index rows and validation are derived from the same route identity rather than copied into locale-specific tables.

`IndexNow` is intentionally not part of the core publication contract. Brali's authoritative discovery path is crawlable internal navigation plus canonical HTML and generated sitemaps. IndexNow may be added later as a best-effort notification accelerator if change frequency justifies key management and changed-URL delivery; it must never become a prerequisite for a valid deployment. Google's Indexing API is not used for ordinary Brali pages.

## Browser proof

`scripts/check-browser-localizations.mjs` reads the generated locale manifest and visits every declared route for the release locale in real Chromium at 320 px. It also rechecks representative routes at tablet/desktop viewports, exercises keyboard focus, captures screenshots and ARIA snapshots, and fails on structural localization regressions, horizontal overflow, source-language shell leakage or unreadable filled-button contrast.

The browser script is intentionally separate from `scripts/check-live-localizations.mjs`: HTTP/HTML verification is not evidence of rendered browser behavior. The Russian closure pass demonstrated why this distinction matters: DOM/ARIA checks were green while a higher-specificity prose-link rule made filled CTA text visually disappear. That defect is now covered by computed foreground/background contrast checks.

Hosting noise must not be converted into product debt, but retries must stay narrow. Browser navigation may retry a transient navigation failure or HTTP 5xx response with bounded backoff. HTTP 4xx responses and DOM, language, canonical/hreflang, overflow, contrast, keyboard or accessibility findings are not retried away.

## Secondary English-only surfaces

Brali may keep secondary technical/reference surfaces in the canonical locale when they are outside the declared human-interface release. That boundary is not localization debt if all three conditions hold:

1. the localized route does not pretend that a translated counterpart exists;
2. links from localized pages explicitly declare `lang="en"`/the English boundary;
3. the surface is not part of primary localized navigation or an exact localized surface contract.

If any of those conditions changes, the route must be added to the locale contract and localized before the release can retain the same claim.

## Closure rule

Do not close localization from commit messages, coverage percentages or green CI alone. Close it from the merged SHA only after generated artifacts and deployed production agree, the real-browser evidence is green, and release-blocking debt is resolved.

When a debt item is closed, keep its closure evidence inspectable: record the deployed SHA/run or equivalent immutable evidence, the verified scope and the gate that proved it. Keep intentionally English-only secondary surfaces explicit instead of silently treating them as localized.
