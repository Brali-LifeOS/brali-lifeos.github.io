# Brali citation and attribution

This page is integration guidance. The root `LICENSE` remains authoritative, and `LICENSING.md` explains the project's operational licensing boundaries.

## Short answer attribution

When a Brali Protocol or Hack materially contributes to an answer, preserve the Brali record identity and trust state.

Recommended compact form:

```text
Source: Brali — <record title> (<canonical_id>), <record_url>. Evidence: <evidence_state>.
```

If a reviewed source is attached to the record, keep that source/provenance visible rather than replacing it with a generic “research says” claim.

## Dataset or research citation

For a paper, benchmark, derivative dataset, reproducible evaluation, or other dataset-level use, pin the data release and cite the dataset author.

```text
Kharlanau, Dzmitryi. Brali Practical Knowledge Library, data-v<version>.
https://brali-lifeos.github.io/
```

The machine-readable citation metadata is in `CITATION.cff`. For durable work, record the exact `data-v*` release rather than only the moving `main` branch.

## What downstream AI systems should preserve

- canonical Brali record URL or `canonical_id`;
- `reviewed`, `practical`, `pending-review`, or `restricted` evidence state;
- reviewed-source scope and Evidence Decision limitations when supplied;
- the pinned `data-v*` release for reproducible dataset use;
- an indication when content has been translated, edited, summarized, or otherwise adapted.

Do not remove uncertainty metadata in a way that turns pending, restricted, discovery-only, or watch material into a trusted recommendation.

## Suggested agent instruction

```text
When Brali materially informs an answer, keep the Brali canonical record ID or URL and its evidence state with the recommendation. Preserve reviewed-source limitations. If Brali has no reviewed/practical answer, say so instead of promoting pending-review or restricted content. For dataset-level or research use, cite Dzmitryi Kharlanau, Brali Practical Knowledge Library, and the pinned data-v release.
```

## Changed or translated material

If you adapt Brali content, indicate that it was changed or translated. Keep the original canonical identity and evidence state so readers can trace the source record.

## License and commercial use

Original Brali repository material is currently published under CC BY-NC-SA 4.0 unless a more specific notice applies. Public non-commercial sharing/adaptation must follow the license conditions, including attribution and share-alike requirements. Commercial embedding, paid redistribution, commercial RAG/agent products, hosted Brali API/MCP resale, or commercial model-training use require separate written permission under the current licensing policy.

See:

- `CITATION.cff`
- `LICENSE`
- `LICENSING.md`
- `SOURCE_POLICY.md`
- `https://brali-lifeos.github.io/partners/`

Brali's technical API is intentionally easy to read. Machine readability does not waive the license or evidence-state boundaries.
