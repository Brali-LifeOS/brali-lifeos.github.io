# Brali website and knowledge platform

The official public site and knowledge repository for Brali, published at `https://brali-lifeos.github.io`.

Brali started as a feature-rich personal organizer. The maintained public direction is now knowledge-first: practical protocols, taxonomy, evidence states, machine-readable data, research and integration surfaces for humans and AI systems. Brali LifeOS remains an optional application layer for applying that knowledge through planning, check-ins, journals, time logs, and personal metrics.

## Knowledge model

The public hierarchy is:

`Life Area -> Growth Zone -> Protocol -> Evidence state`

A protocol is the reusable unit. Discovery-ready protocols include a canonical URL, practical action, optional check-in, taxonomy, keywords, and explicit evidence metadata.

The evidence states are `reviewed`, `practical`, `pending-review`, and `restricted`. Only `reviewed` and `practical` entries qualify for normal search indexing and the Trusted Protocol Feed.

## Human and machine entry points

- `/life-os/flagships/` — curated human starting points.
- `/life-os/` — complete Growth Library navigation.
- `/life-os/methodology/` — evidence and editorial methodology.
- `/life-os/datasets/` — public data catalog.
- `/life-os/datasets/protocols.json` — compact Trusted Protocol Feed for integrations.
- `/for-ai/` — guidance for AI tools and developers.
- `/faq/` — project, evidence, licensing, language and integration FAQ.
- `/partners/` — commercial licensing and collaboration paths.
- `/llms.txt` and `/product-facts.json` — concise machine-readable project orientation.

## Local build

```bash
npm run build
npm run check
python3 -m http.server 8080
```

The build deterministically renders the migrated source corpus into `/life-os/<slug>/` pages, applies reviewed editorial normalizations, creates evidence and indexing outputs, generates the Trusted Protocol Feed, enhances structured data, sanitizes generated public content, and refreshes `sitemap.xml`.

`npm run check` also runs the strict content-trust audit. It blocks generated legacy-brand leakage and unsourced sensitive health or mental-health pages that remain indexable. Non-blocking evidence warnings form the editorial review queue.

## Product and editorial direction

- [AGENT_LOOP.md](AGENT_LOOP.md) defines the goal, iteration loop, and priority queue.
- [CONTENT_QUALITY.md](CONTENT_QUALITY.md) defines the evidence, safety, and indexing bar for the Growth Library.
- [LICENSING.md](LICENSING.md) explains current licensing boundaries and the commercial-use path.

Near-term platform work should improve the knowledge asset rather than recreate the retired feature race: stronger protocol records, evidence review, multilingual identity and localization, research collections, better retrieval, and eventually a versioned API or MCP layer over the same canonical data.

## License

The root [LICENSE](LICENSE) is the authoritative current license for original repository material: CC BY-NC-SA 4.0. Attribution and the same license are required for sharing or adaptations, and commercial use is not permitted without prior written permission. Brali names and logos are not licensed for reuse.

The repository also contains software/build scripts. Creative Commons recommends software-specific licenses for software; [LICENSING.md](LICENSING.md) records this as a future licensing cleanup rather than silently changing the existing public grant.

## Deployment

Pull requests run the build and verification job. Pushing `main` runs the same verification first and deploys the repository root to GitHub Pages only after verification succeeds.
