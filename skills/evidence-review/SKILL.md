---
name: brali-evidence-review
description: Review a Brali research candidate against the actual source and decide whether it changes existing content or merits a new proposal.
---

# Brali Evidence Review

Start from one candidate in `data/research-candidates.json` and read `SOURCE_POLICY.md`.

Read the actual source when available. Identify population, intervention/exposure, comparison, outcomes, study design, effect direction, limitations, and what wording is genuinely supported.

Every evidence decision must retain the source title, stable URL, DOI when available, source type, and a concise citation. Record the exact supported claim separately from limitations and unsupported or overstated claims.

Compare the result with current Brali content.

Return exactly one editorial decision: `rejected`, `watch`, `support-existing`, `challenge-existing`, `propose-hack`, or `propose-protocol`.

When proposing content, use the knowledge contracts. Keep quantitative claims only when they are necessary, correctly scoped, and traceable. Any research-derived public proposal must carry the source records forward so the final page can show them to readers.

For sensitive subjects, narrow the claim and add safety limitations.

Never treat citation count, abstract wording, a press release, search snippet, secondary summary, or AI summary as proof. If the full source cannot be checked, keep the candidate unreviewed or on watch rather than laundering uncertainty into a citation.
