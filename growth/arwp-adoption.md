# Brali — ARWP Growth adoption record

Baseline: 2026-09-06  
Site: https://brali-lifeos.github.io/  
Repository: `Brali-LifeOS/brali-lifeos.github.io`  
Verticals: editorial, documentation  
Goals: Search eligibility, generative Search, recommendation/citation opportunity, measurable visibility, agent discovery

This record applies the ARWP Growth Loop to Brali. It is implementation evidence, not a claim that a search or AI platform ranks, recommends, indexes, or cites Brali because of ARWP.

## Publisher policy

- Public Search crawling: allowed.
- OAI-SearchBot: explicitly allowed.
- ChatGPT-User: explicitly allowed.
- GPTBot: explicitly allowed at this baseline; training policy remains an independent publisher decision and is not changed by the Growth rollout.
- Public content reuse remains governed by Brali's published license and terms.

## Selected hypotheses

| Hypothesis | Baseline | 2026-09-06 action | Verification / measurement |
| --- | --- | --- | --- |
| `search-foundation-first` | Active foundation | Preserve crawl/index/canonical/sitemap checks | Existing Pages verification + Google Search pipeline |
| `non-commodity-evidence` | Active, manual | Keep evidence review, source links, limitations and original practical synthesis ahead of query-variant publishing | Manual content review; preserve negative/uncertain evidence |
| `answer-addressability` | Active | Preserve descriptive headings and stable section IDs on long-form pages | Site checks + retrieval tests |
| `identity-and-provenance` | Partial | Add canonical Brali Organization identity to the homepage using the same `#organization` ID already used by articles | Build check |
| `discover-visual-preview` | Partial | Allow large image previews; use representative article images for large social cards and `Article.image` / `primaryImageOfPage` | Build check; later Discover/image impressions |
| `preferred-source-loop` | Applicable experiment | Add a bounded Preferred Sources CTA to the Updates surface for repeat readers | User-selection/return-traffic evidence where observable |
| `chatgpt-search-access` | Active | Keep OAI-SearchBot explicit and keep GPTBot policy explicit/separate; do not infer citation from access | ChatGPT referrals/citations when observable |
| `freshness-without-fake-recency` | Active | Keep semantic sitemap `lastmod` derived from real content updates | Existing sitemap checks / recrawl observations |
| `platform-ai-measurement` | Partial | Keep daily Google Search owner-side pipeline; add recurring ARWP Growth artifact with exact ARWP revision | Google generative/Search data; add Bing/ChatGPT evidence only when available |

`agent-readable-routes` remains an interoperability layer, not a ranking hypothesis. Brali already exposes truthful API, citation, evidence, trust and agent surfaces; these remain separately validated.

## Implementation contract

1. Brali's own build and checks remain the deployment gate.
2. Every generated HTML page allows `max-image-preview:large` unless a future page intentionally overrides that policy.
3. Article pages with a non-generic `og:image` expose the same representative image to large social previews and JSON-LD.
4. Homepage identity, Preferred Sources CTA, OAI-SearchBot access and explicit GPTBot policy are regression-checked.
5. A weekly ARWP Growth audit follows current ARWP `main` but stores the exact audited ARWP commit beside the JSON report.
6. Search/AI outcome movement is measured independently; implementation alone is never marked as success.

## Decision

Initial decision: **keep and measure**. Revisit after owner-side visibility evidence accumulates. Neutral or negative movement remains valid evidence and can lead to revise/revert/retire.
