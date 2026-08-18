# Brali LifeOS website

The official static site for Brali LifeOS, published at `https://brali-lifeos.github.io`.

## Local build

```bash
npm run build
npm run check
python3 -m http.server 8080
```

The build deterministically renders the migrated Life OS dataset into `/life-os/<slug>/` pages, sanitizes generated public content, and refreshes `sitemap.xml`.

`npm run check` also runs the strict content-trust audit. It blocks generated legacy-brand leakage and unsourced sensitive health or mental-health pages that remain indexable. Non-blocking evidence warnings form the editorial review queue.

## Product and editorial direction

- [AGENT_LOOP.md](AGENT_LOOP.md) defines the goal, iteration loop, and priority queue.
- [CONTENT_QUALITY.md](CONTENT_QUALITY.md) defines the evidence, safety, and indexing bar for the Growth Library.

## License

The original Brali LifeOS website content is licensed under [CC BY-NC-SA 4.0](LICENSE): attribution and the same license are required for sharing or adaptations, and commercial use is not permitted without prior written permission from MetalHatsCats. Brali LifeOS names and logos are not licensed for reuse.

## Deployment

Pull requests run the build and verification job. Pushing `main` runs the same verification first and deploys the repository root to GitHub Pages only after verification succeeds.
