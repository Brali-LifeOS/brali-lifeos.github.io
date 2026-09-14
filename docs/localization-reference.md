# Localization reference contract

Russian (`ru`) is Brali's reference human-interface locale. It is an implementation example, not a special case that future locales should copy into new language-specific workflows.

## Lifecycle

A human-interface locale moves through:

`draft` -> `reviewed-partial` -> `published`

`quality_state` / `localization_quality` is independent from canonical `evidence_status`. Translation and editorial review must never upgrade evidence.

A locale may be `published` only when the deployed revision has passed all six proof classes:

1. **contract** — registry, route prefix, direction, dataset root, required gates and declared surfaces are valid;
2. **corpus** — stable IDs reconcile against the effective canonical corpus, including build-time additions;
3. **language** — deterministic language/editorial audit has no unresolved release-blocking findings;
4. **rendered** — generated human and machine surfaces satisfy locale metadata and no-silent-fallback invariants;
5. **browser** — real Chromium passes the complete 320 px route corpus plus representative tablet/desktop, keyboard and ARIA checks;
6. **live** — deployed HTTP routes, manifest, library, canonical/hreflang graph, sitemap, `llms.txt` and robots declarations match the locale registry.

## Adding a new language wave

1. Add the locale to `.arwp/localization.json` with `role: human-interface`, `status: draft`, BCP-47 `languageTag`, `direction`, `routePrefix`, `datasetRoot`, `searchPublication`, `requiredGates` and `releaseProof`.
2. Keep canonical stable IDs and provenance unchanged in localized authoring data.
3. Implement the locale's source/editorial audit. Technical identifiers and proper nouns may remain in English; accidental source-language UI or prose leakage may not.
4. Build the locale's authoring and rendered surfaces. Any intentionally untranslated human surface must be an explicit source-locale boundary, not a silent fallback.
5. Reconcile against the **effective** canonical corpus, not only a stale source snapshot.
6. Run contract, corpus, language, rendered and adversarial fault-injection gates.
7. Move to `reviewed-partial` only when the claimed review state is true. This automatically brings the locale into the registry-driven post-deploy live/browser runner.
8. Deploy a candidate. `scripts/run-localization-release-gates.mjs` must pass both `live` and `browser` for every release-state human-interface locale.
9. Promote to `published` and `searchPublication: full` only after full intended corpus parity and the six proof classes are established for the deployed revision.

## Required failure modes

Regression protection must continue to reject at least:

- missing localized stable ID;
- duplicate stable ID;
- empty or null required text;
- invalid localization quality state;
- non-authoritative localized record;
- unknown canonical/source ID;
- stale source fingerprint or source mismatch;
- evidence-state drift;
- obvious source-language leakage in localized content or shared UI;
- missing reciprocal hreflang/canonical/sitemap/machine surface;
- route-prefix, language-tag or direction drift;
- 320 px horizontal overflow or broken keyboard focus.

## Shared release runner

Post-deploy verification is registry-driven. Do not add another language-specific Pages workflow step for `de`, `fr`, `it`, or later locales. Once a locale reaches `reviewed-partial` or `published`, the release runner discovers it from `.arwp/localization.json` and executes the common live and Chromium gates with that locale's registry values.

Language-specific source/editorial checks remain separate because linguistic quality cannot be proven by a generic technical checker.

## Boundary of proof

A green localization release proves the declared corpus, generated pages, browser behavior and machine-facing invariants for the deployed revision. It does not prove search ranking, crawler adoption, AI citation, traffic, conversion or subjective literary excellence. Those remain separate observations rather than localization release claims.
