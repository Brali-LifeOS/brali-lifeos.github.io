# Brali visual implementation QA

## Source and capture

- Selected design source: `reports/design-reference-user-attached.png` (1487 × 1058 px), the image supplied by the user.
- Final implementation capture: `reports/design-home-qa-default-final.png` (1472 × 1047 rendered px), captured with the browser overridden to the reference's 1487 × 1058 CSS viewport and the default Focus state. The in-app browser reserves 15 px for its vertical scrollbar and 11 px for its frame.
- Same-input comparison: `reports/design-qa-compare-user.html` and `reports/design-qa-comparison-user-final.png`. The full views and focused hero/card views are paired at equal size.
- Responsive evidence: `reports/design-home-mobile-final-v3.png`, captured at 390 × 844. Representative routes also covered the homepage, protocol library, topic index, topic detail, research, evidence, AI/developer and protocol-detail templates.

### Audience-card correction source and capture

- User-reported source: `reports/audit-audience-reference-user.png` (1726 × 248 px), showing copy covered by oversized people, researcher and robot imagery.
- Corrected wide capture: `reports/audit-audience-02-fixed-wide.png` (1785 × 200 px) at a 1800 px browser viewport.
- Final user-width capture: `reports/audit-audience-05-final-user-width.png` at a 1732 px browser viewport.
- Responsive captures: `reports/audit-audience-03-tablet-final.png` at 1181 px and `reports/audit-audience-04-mobile-final.png` at 390 px.
- Same-input comparison: `reports/audit-audience-compare.html` and `reports/audit-audience-comparison-final.png`. The supplied crop is already a focused component view, so an additional crop was not needed.
- State: default homepage audience strip; all three cards visible.

## Comparison history

1. P1 · Reference geometry: the first implementation differed in hero headline, matcher and evidence-card placement. Final DOM measurements are h1 x70/y203/bottom549, matcher x801/y152, and card x802/y296/bottom833, matching the source within the browser's raster tolerance.
2. P1 · Mascot presence: the hero character was underrepresented. Added a dedicated pointing pose with the same yellow one-eye character, coral idea rays, navy linework and grainy editorial finish.
3. P1 · Mobile containment: the 977 px protocol card initially extended past its yellow stage. Increased the mobile stage to 1140 px; final measurement confirms card bottom 2089.8 is inside hero bottom 2100.4.
4. P2 · Category imagery: topic images did not resolve because the canonical link lives in the document head. Corrected the selector strategy and verified the seven category illustrations on the rendered topic grid and detail surfaces.
5. P2 · Global shell: aligned the Brali wordmark, menu labels, button, account control, spacing, sizes and font system with the source, then applied the shell across 1,207 HTML pages.
6. Final combined comparison confirms the source hierarchy, line wrapping, warm paper/yellow split, dark evidence card, audience bands, radii, borders, typography and visual density.
7. P1 · Audience copy collision: the three illustrations were card-wide CSS backgrounds, so cover scaling and cached CSS enlarged them under the copy. Replaced them with semantic image elements constrained to dedicated image columns; shortened the research/AI copy and added descriptive alt text. Final wide measurements show 17.8 px between image and copy regions with zero overlaps.
8. P2 · Mid-width overflow: the desktop hero and header stayed in their wide layout below their combined minimum width. Moved their responsive transition to 1320 px. At 1181 px the final document width is 1166 px with no horizontal overflow.
9. Post-fix evidence: at 390 px every audience card has an 11.25 px gap between image and copy, no horizontal overflow, and all headings remain fully visible. The 1800 px, 1181 px and 390 px browser captures contain no image/text collisions.

## Functional and accessibility checks

- Manrope loaded and was the computed body and heading family.
- Homepage goal selection updates the protocol title, summary, three steps, timings, topic destination and protocol link.
- The account menu opens and exposes getting-started, support and privacy destinations.
- No browser console errors after the primary interaction.
- All three corrected audience images loaded at 1448 × 1086 source resolution; their links resolve to the library, research and AI/developer routes.
- No horizontal overflow across the representative desktop and mobile routes.
- Semantic labels, skip link, focus-visible styles, reduced-motion handling, alt text, and practical mobile tap targets are present.
- Full project check passed with a task-specific writable npm cache after the default user npm cache reported an unrelated permissions problem.

## Site-wide readability and section-rhythm pass

- Current-run before/after evidence covers the homepage, library, Topic index, Topic detail, protocol detail, Research, AI/developer, Query Playground, problem collection, and dataset templates at 1440 × 1024 and 390 × 844.
- Internal page-title scale was reduced and long H1/H2 content now receives a dedicated balanced-wrap treatment. Representative protocol and Research titles changed from visually dominant three-hundred-plus-pixel blocks to controlled two- or three-line compositions.
- Reading copy is constrained to an approximately 830 px measure with a 1.7–1.72 line height. Consecutive sections now have explicit dividers and stronger vertical rhythm.
- Deep pages received breadcrumbs; active navigation, metadata pills and mobile tap targets were refined; odd final cards are centered on wide screens and return to full width on mobile.
- Evidence grids inside prose now use the full available page width. Final desktop evidence measured 1,345 px wide with two 662 px cards and no overlap.
- The shell generator normalizes exactly one skip link per published page. Final representative browser checks found zero broken images, no horizontal overflow, and one skip link on every tested route.
- Query Playground was verified in its trusted-answer state on mobile: five protocol results, enabled copy actions, no horizontal overflow and no browser console errors.
- Final evidence: `reports/site-audit-38-problem-evidence-after-desktop.jpg`, `reports/site-audit-39-query-mobile-final.jpg`, `reports/site-audit-40-query-result-mobile-final.jpg`, and `reports/site-wide-visual-audit.md`.
- Same-input comparison: `reports/site-audit-comparison.html` and `reports/site-audit-comparison-final.jpg` pair current-run before/after captures at matched desktop and mobile viewports.
- Full post-generation `npm run build`, `npm run check`, script syntax validation, and `git diff --check` passed.
- Mobile H1 follow-up: internal page titles were reduced from 42–52 px / 38–46 px to 34–40 px / 31–36 px. Six representative routes now produce 71–131 px title blocks at 390 px, while the homepage hero remains unchanged. Same-viewport evidence is in `reports/site-audit-h1-mobile-comparison.html` and `reports/site-audit-h1-mobile-comparison-final.jpg`.

## Result

final result: passed
