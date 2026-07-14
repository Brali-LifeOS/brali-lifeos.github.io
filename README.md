# Brali LifeOS website

The official static site for Brali LifeOS, published at `https://brali-lifeos.github.io`.

## Local build

```bash
npm run build
npm run check
python3 -m http.server 8080
```

The build deterministically renders the migrated MetalHatsCats Life OS dataset into `/life-os/<slug>/` pages and refreshes `sitemap.xml`.

## License

The original Brali LifeOS website content is licensed under [CC BY-NC-SA 4.0](LICENSE): attribution and the same license are required for sharing or adaptations, and commercial use is not permitted without prior written permission from MetalHatsCats. Brali LifeOS names and logos are not licensed for reuse.

## Deployment

Pushing `main` runs the GitHub Pages workflow. It builds the Life OS pages and deploys the repository root without a base-path rewrite, which is correct for this organization Pages domain.
