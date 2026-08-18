---
name: brali-evidence-review
description: Review a Brali research candidate against the actual source and decide whether it changes existing content or merits a new proposal.
---

# Brali Evidence Review

Start from one candidate in `data/research-candidates.json`.

Read the actual source when available. Identify population, intervention/exposure, comparison, outcomes, study design, effect direction, limitations, and what wording is genuinely supported.

Compare the result with current Brali content.

Return exactly one editorial decision: `rejected`, `watch`, `support-existing`, `challenge-existing`, `propose-hack`, or `propose-protocol`.

When proposing content, use the knowledge contracts. Keep quantitative claims only when they are necessary, correctly scoped, and traceable. For sensitive subjects, narrow the claim and add safety limitations.

Never treat citation count, abstract wording, a press release, or an AI summary as proof.
