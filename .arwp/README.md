# Cite Goose / ARWP adoption

This directory contains Brali's publisher-authored ARWP contracts. They describe intent and adoption state; they are not ranking, indexing, citation or efficacy certification.

Contract revision: 2026-09-11. General ARWP validation and Internal Discovery & Distribution are pinned to revision `793483e3404a97f7892e86bcda3fd317d5c7427c`. Image Discovery remains pinned to its reviewed source revision `73bd2a64e2e746deeb8de792ca01f654f0a7d33a`.

## Current contracts

- `adoption.json` — retained discoverability/adoption experiment contract and evidence boundaries.
- `site-focus.json` — Cite Goose Site Focus v0.3 product and experience contract.
- `image-discovery.json` — Image Discovery adoption record for crawlable representative imagery, preferred-image convergence, image sitemap coverage and final/live verification.
- `internal-discovery.json` — Internal Discovery & Distribution record for canonical protocol hierarchy paths, existing Related-protocol graph integrity and canonical page utilities.
- `../ai/site-profile.json` — machine/agent service map for real published Brali interfaces.

The Site Focus contract makes Brali's product boundary explicit: the primary product is an evidence-aware practical knowledge library that helps a person move from a real-life problem to one bounded protocol. Research, ontology, datasets, APIs and agent integrations support that product; they are not separate reasons to broaden the homepage indefinitely.

## Product boundary

IN: practical protocols, problem-first discovery, inspectable evidence/provenance and bounded next actions.

ADJACENT: research, ontology, datasets, read-only API/retrieval/agent surfaces and the legacy LifeOS organizer layer.

OUT: clinical diagnosis/treatment, generic self-help publishing, an all-purpose organizer feature race, unsupported efficacy claims and Search/AI guarantees.

## Validation

The repository's Cite Goose Site Focus workflow validates `.arwp/site-focus.json` against the current v0.3 contract and runs a bounded comparison against the public site. The resulting report is evidence for review, not an instruction to delete or split pages automatically.

Image Discovery runs only for canonical sitemap pages with a visible informative same-origin image. It reuses human-authored alt text rather than inventing unseen visual details, aligns preferred-image signals and publishes image sitemap entries in the final sitemap. The final Pages artifact is gated before upload and a bounded live check fetches the published pages and image assets after deployment.

Internal Discovery & Distribution applies only to protocol records already declared `indexable=true` by Brali's evidence/indexing system. It does not replace the existing Related protocols algorithm. Instead it adds explicit hierarchy continuation to the maintained Growth Zone, Life Area and published ontology Topic, plus browser-local Save, Share, Copy link and conservative Cite actions. The final gate also verifies that existing Related-protocol edges still target only indexable protocol records. A bounded live check runs after deployment.

Discover-specific image-size guidance remains separate from ordinary Google Images crawl/index eligibility. Link volume, utilities and graph cleanliness are implementation/navigation evidence rather than ranking proof.

A focus, image-discovery or internal-discovery warning should be resolved by checking the actual product boundary, page role and final artifact. Do not weaken the contract merely to make CI quiet.

## Evidence rule

Implementation success remains separate from external outcome evidence. A valid profile or passing focus, Image Discovery or Internal Discovery gate does not prove indexing, ranking, AI citation, user adoption or protocol effectiveness. Missing observations remain unknown.
