# Brali data versioning

Brali exposes a stable knowledge identity separately from titles, URLs and taxonomy wording.

- Canonical IDs use `brali:<kind>:<local-id>`.
- Existing historical IDs remain aliases and must not be silently reassigned.
- `dataset_version` changes when released data changes.
- `schema_version` changes when a machine-readable shape changes.
- Patch changes are additive/corrective, minor changes may add fields or entities, and major changes may remove or redefine fields.
- Consumers that need reproducibility should pin a `data-v*` release rather than `main`.

Renames keep the same canonical ID. Merges and replacements must publish aliases/replacement metadata before an old identity is retired.
