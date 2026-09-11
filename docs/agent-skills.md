# Brali Agent Skills architecture

## Core invariant

Brali uses a one-skill-per-hack model.

Every record in `data/life-os-content/index.json` must generate exactly one stable Agent Skill surface on every build:

- `/skill-packs/<hack-slug>/SKILL.md`
- `/skill-packs/<hack-slug>/skill.json`
- `/skill-packs/<hack-slug>/index.html`

There is no manual allow-list of hacks that receive skills. Adding a new hack to the canonical corpus is sufficient; the next normal `npm run build` creates the skill automatically.

`npm run skills:check` enforces `generated skills == current hacks` and fails on missing, duplicate or trust-inconsistent skill artifacts.

## Two machine catalogs

The library deliberately separates identity coverage from recommendation eligibility.

### `skill-packs/library.json`

Complete corpus. It contains one entry for every hack, regardless of review state.

Use this surface for:

- marketplace/library browsing;
- identity resolution;
- corpus coverage checks;
- editorial review workflows;
- agent/tooling that must know a skill artifact exists for every hack.

Do **not** treat every entry in this file as trusted practical guidance.

### `skill-packs/catalog.json`

Trusted/recommendation-eligible subset only.

An entry belongs here only when its canonical Brali record currently meets the trusted feed rules (`reviewed` or eligible `practical`). Use this surface for normal practical recommendations and agent routing.

## Skill modes

Trust state changes behavior, not identity.

| Evidence state | Skill mode | Normal recommendation? | Operational steps? | Search sitemap? |
| --- | --- | --- | --- | --- |
| `reviewed` | `usable` | yes | yes, bounded by the canonical record | yes |
| `practical` | `usable` | yes | yes, bounded by the canonical record | yes |
| `pending-review` | `review-required` | no | draft may be visible for review, explicitly non-trusted | no |
| `restricted` | `restricted-reference` | no | no; the skill is a non-operational reference shell | no |

This split prevents a common failure mode: creating a `SKILL.md` file must never be interpreted as evidence that the underlying idea is safe, reviewed or recommended.

## Generation flow

`scripts/build-skill-packs.mjs` reads:

1. the full hack index under `data/life-os-content/index.json`;
2. each canonical source record under `data/life-os-content/<slug>.json`;
3. each generated machine record under `life-os/<slug>/index.json`;
4. the Trusted Protocol Feed to decide recommendation eligibility.

For every hack it generates a deterministic Agent Skill identity, host installation metadata, provenance links and SHA-256 checksum.

Long hack slugs are mapped to an Agent Skills-compatible name of at most 64 characters using a deterministic hash suffix, while the public Brali route keeps the canonical hack slug.

## Host support

Each skill publishes installation metadata for:

- Claude Code: personal and project skill paths;
- Hermes Agent: direct `hermes skills install <SKILL.md URL>` command;
- OpenClaw: workspace and global skill roots;
- other AgentSkills.io-compatible hosts via the raw `SKILL.md` artifact.

The repository also keeps the `brali-life-os` router skill for users who prefer installing one skill that selects from the trusted Brali catalog instead of installing individual skills.

## Search and discovery boundary

The marketplace page `/skill-packs/` is indexable.

Only `usable` skill pages enter the trusted search sitemap. Review-required and restricted-reference skill pages still exist at stable URLs and in `library.json`, but are generated with `noindex,follow` and are excluded from the trusted skill sitemap.

This provides full agent/library coverage without using unreviewed or restricted material as SEO inventory.

## Verification

Run:

```bash
npm run skills:build
npm run skills:check
```

The check validates the complete corpus, including:

- one skill for every current hack;
- deterministic, unique Agent Skills-compatible names;
- canonical protocol ID and URL parity;
- evidence-state and skill-mode parity;
- trusted catalog contains only usable skills;
- review-gated skills never enter the trusted catalog;
- restricted-reference skills contain no executable protocol or draft-action section;
- host installation metadata exists;
- `SKILL.md` and `skill.json` SHA-256 parity;
- usable pages are indexable and review-gated skill pages are `noindex`.

The full Pages workflow also runs this gate after the site build. Do not weaken the one-skill-per-hack invariant to make CI pass; fix the generator or canonical data instead.
