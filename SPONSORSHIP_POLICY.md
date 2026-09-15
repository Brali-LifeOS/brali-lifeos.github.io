# Sponsorship and commercial independence

Brali can accept commercial support without selling editorial conclusions.

The governing rule is simple: **sponsor the work, never the verdict**.

## What commercial support may fund

Preferred formats, in order:

1. **Independent review underwriting** — a sponsor funds the cost of reviewing a topic or maintenance batch. The sponsor may suggest the topic, but cannot select the conclusion, evidence grade, status, wording, ranking, or whether a hack survives review.
2. **Clearly labelled contextual sponsor cards** — a separate commercial block can appear after the review/evidence surface on an eligible hack page.
3. **Disclosed affiliate links** — only when Brali independently chooses to mention a relevant product or service. Compensation must not determine the recommendation or placement in evidence/retrieval data.
4. **Data/API or integration partnerships** — paid implementation or higher-service layers may be offered around the open knowledge corpus, provided access terms and editorial independence remain explicit.

Generic third-party ad scripts are not the default. They add tracking, performance, brand-safety, consent and editorial-perception costs. A small first-party sponsorship registry is preferred until scale makes another model clearly better.

## Hard firewall

Commercial data lives in `data/sponsorships.json`. Review and evidence data live elsewhere.

A sponsorship may not:

- modify `data/hack-review-events.json`;
- modify evidence grades, evidence decisions, sources, claims, safety boundaries, or review outcomes;
- change search, retrieval, recommendation, benchmark, agent-skill, or dataset ranking;
- make a contested, refuted, retired, or review-due hack look endorsed;
- remove a negative review event;
- use an unlabeled native-looking placement;
- insert executable third-party advertising code through the sponsorship registry.

The renderer treats sponsorship fields as text and URL data only. Sponsored links use `rel="sponsored nofollow noopener"`.

## Placement rules

A paid card must:

- say `Sponsored` visibly;
- appear after the hack's review-history surface, never inside the evidence or verdict block;
- be limited to one active card per hack page;
- use an HTTPS destination;
- be time bounded with `starts_on` and `ends_on`;
- identify the sponsor by name;
- contain no scripts or arbitrary HTML;
- be automatically blocked when the lifecycle status is `needs-review`, `contested`, `refuted`, or `retired`.

## Review underwriting disclosure

If an organization funds an independent review cycle, disclose the funder on the public review record or review-log page. The review event itself must still be written from the evidence and may conclude that the sponsored topic is ineffective, overstated, unsafe, contested, or refuted.

A sponsor receives no pre-publication veto over the substantive conclusion. Factual corrections about the sponsor's own identity or product metadata can be considered separately from editorial conclusions.

## Affiliate links

Affiliate relationships must be disclosed near the link. Brali should not create a product recommendation solely because an affiliate program exists. If the commercial relationship ends, the underlying editorial recommendation should remain defensible or be removed through the normal review process.

## Metrics

Commercial success should be evaluated separately from evidence quality. Useful commercial metrics include sponsor-card views, outbound clicks, inquiries, and partnership conversion. They must not feed back into evidence status or hack ranking.

## Initial operating mode

The repository ships with an empty sponsorship registry. That is intentional: the trust firewall and renderer exist before the first paid placement. Commercial inventory should only be activated after a real partner, terms, disclosure copy, and page fit are reviewed.
