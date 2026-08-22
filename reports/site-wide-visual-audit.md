# Brali site-wide visual audit

Date: 2026-08-22

## Scope

The rendered site was reviewed as a user journey, not only as source code. The pass covered the homepage, Growth Library, Topic index, Topic detail, protocol detail, Research, Methodology, AI/developer, Query Playground, problem collection, and dataset surfaces.

Representative viewports:

- Desktop: 1440 × 1024
- Mobile: 390 × 844

## Findings corrected

1. Long internal-page headings dominated the first screen and could exceed 300 px in height. Internal H1 sizes now use a narrower responsive scale, with a separate treatment for long headings.
2. Long prose headings were visually too close to page-title scale. Prose H2 sizes are now capped, and sentence-like headings receive the long-heading treatment.
3. Deep pages lacked location context. Breadcrumbs were added to 1,183 generated deep pages.
4. Direct page copy could stretch too wide. Primary reading copy is now constrained to an approximately 830 px measure with a more relaxed line height.
5. Consecutive content sections needed stronger rhythm. Section dividers and additional vertical spacing now make long pages easier to scan.
6. Odd final cards in two-column grids looked accidental. The final card is now centered on wide screens and returns to full width on mobile.
7. Evidence-boundary grids inside prose were unnecessarily narrow. These grids now use the full content width while prose remains constrained.
8. Repeated shell generation had introduced multiple skip links on some pages. The generator now normalizes every published page to exactly one skip link.
9. Active navigation, metadata pills, breadcrumb wrapping, mobile navigation spacing, and tap-target sizing were refined for clearer orientation and use.

## Rendered verification

- Eight representative routes were checked at both desktop and mobile sizes after the final build.
- Every checked route had zero broken images and no horizontal overflow.
- All checked pages exposed exactly one skip link.
- The Query Playground returned five trusted protocols, enabled its copy actions, and produced no browser console errors.
- The problem-collection evidence grid measured 1,345 px wide with two 662 px cards at desktop size.
- The longest representative internal title was reduced from a three-hundred-plus-pixel block to a controlled two- or three-line composition.

## Accepted visual evidence

- `reports/site-audit-27-topic-after-desktop.png`
- `reports/site-audit-33-protocol-long-after-desktop.png`
- `reports/site-audit-38-problem-evidence-after-desktop.jpg`
- `reports/site-audit-39-query-mobile-final.jpg`
- `reports/site-audit-40-query-result-mobile-final.jpg`
- `reports/site-audit-comparison-final.jpg` (matched before/after review board)

## Accessibility notes

Strengths verified in the rendered implementation include skip navigation, visible keyboard focus styling, reduced-motion handling, descriptive image alternatives, readable contrast, responsive containment, and practical mobile controls.

This visual pass is not a replacement for a full WCAG conformance audit. Screen-reader announcements, complete keyboard traversal across all 1,207 published HTML pages, zoom/reflow beyond the tested viewports, and assistive-technology behavior remain outside the screenshot-based verification scope.

## Validation

- `npm run build`: passed
- `npm run check`: passed
- `node --check scripts/apply-brand-shell.mjs`: passed
- `git diff --check`: passed

## Mobile H1 follow-up

After user review, the internal mobile H1 scale was reduced again. Standard internal titles now use 34–40 px and long titles use 31–36 px. The homepage hero remains intentionally unchanged. Six representative internal routes were rechecked at 390 px; the tested H1 blocks measured 71–131 px tall, with no horizontal overflow or broken images.

Evidence: `reports/site-audit-41-problem-h1-mobile-final.jpg`, `reports/site-audit-42-query-h1-mobile-final.jpg`, `reports/site-audit-h1-mobile-comparison.html`, and `reports/site-audit-h1-mobile-comparison-final.jpg`.
