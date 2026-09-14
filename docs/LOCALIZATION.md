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

## Browser proof

`scripts/check-browser-localizations.mjs` reads the generated locale manifest and visits every Russian route in real Chromium at 320 px. It also rechecks representative routes at tablet/desktop viewports, exercises keyboard focus, captures screenshots and ARIA snapshots, and fails on structural localization regressions or horizontal overflow.

The browser script is intentionally separate from `scripts/check-live-localizations.mjs`: HTTP/HTML verification is not evidence of rendered browser behavior.

## Secondary English-only surfaces

Brali may keep secondary technical/reference surfaces in the canonical locale when they are outside the declared human-interface release. That boundary is not localization debt if all three conditions hold:

1. the localized route does not pretend that a translated counterpart exists;
2. links from localized pages explicitly declare `lang="en"`/the English boundary;
3. the surface is not part of primary localized navigation or an exact localized surface contract.

If any of those conditions changes, the route must be added to the locale contract and localized before the release can remain `published`.

## Closure rule

Do not close localization from commit messages, coverage percentages or green CI alone. Close it from the merged SHA only after generated artifacts and deployed production agree, the real-browser evidence is green, and release-blocking debt is resolved.
