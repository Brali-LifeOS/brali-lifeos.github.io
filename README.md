# Brali LifeOS website

The official static site for Brali LifeOS, published at `https://brali-lifeos.github.io`.

## Local build

```bash
npm run build
npm run check
python3 -m http.server 8080
```

The build deterministically renders the migrated MetalHatsCats Life OS dataset into `/life-os/<slug>/` pages and refreshes `sitemap.xml`.

## Deployment

Pushing `main` runs the GitHub Pages workflow. It builds the Life OS pages and deploys the repository root without a base-path rewrite, which is correct for this organization Pages domain.
