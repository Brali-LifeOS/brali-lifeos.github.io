# Brali data versioning

Brali exposes a stable knowledge identity separately from titles, URLs and taxonomy wording.

- Canonical IDs use `brali:<kind>:<local-id>`.
- Existing historical IDs remain aliases and must not be silently reassigned.
- `dataset_version` changes when released data changes.
- `schema_version` changes when a machine-readable shape changes.
- Patch changes are additive/corrective, minor changes may add fields or entities, and major changes may remove or redefine fields.
- Consumers that need reproducibility should pin a `data-v*` release rather than `main`.

Renames keep the same canonical ID. Merges and replacements must publish aliases/replacement metadata before an old identity is retired.

## Stable baseline

The first stable dataset line is `1.0.0`, published under the immutable tag convention `data-v1.0.0`. Release notes live in `docs/releases/<version>.md` and are packaged into the corresponding release bundle.

A release is valid only when the requested version matches `data/platform.json`, the canonical dataset manifest carries the same dataset/API version, `npm run build && npm run check` succeeds, and `npm run release:check -- --version <version>` verifies the packaged payload.

Every stable bundle includes the canonical dataset manifest, all Knowledge API v1 endpoint files, `release-manifest.json`, `SHA256SUMS`, citation metadata, license/licensing terms, evidence/source policies, versioning rules, and version-specific release notes.

For a local verification of the current stable baseline:

```bash
npm run build
npm run check
npm run release:data -- --version 1.0.0
npm run release:check -- --version 1.0.0
```
