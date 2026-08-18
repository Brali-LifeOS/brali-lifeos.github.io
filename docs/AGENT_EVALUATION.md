# Agent Evaluation Suite

Brali evaluates the knowledge layer before claiming that an AI answer is better merely because it sounds polished.

## Scope

`data/agent-evaluation-suite.json` contains 50 versioned practical questions across focus, habits, decisions, stress, sleep, movement, memory, learning, communication, creativity, work, digital life, Russian retrieval, explicit no-answer prompts, safety-sensitive prompts, and reviewed evidence boundaries.

Each case can define expected Topics, specific Protocols, acceptable Topic alternatives, expected Evidence Decisions, or a required no-answer outcome.

## Three comparison layers

1. **No-knowledge control** returns no external record. It measures the value of grounding. It is not presented as a benchmark of ChatGPT, Claude, Gemini, or any other model.
2. **Lexical Brali** performs token-overlap retrieval over Flagship 100 text while ignoring ontology aliases, Evidence Decisions, and explicit safety routing.
3. **Structured Brali** routes through canonical Topics, retrieves from Flagship 100, attaches relevant Evidence Decisions, preserves evidence state and source URLs, and may deliberately return no answer.

This separates the value of Brali's structure from the value of merely having a pile of text. A true model-without-Brali A/B requires pinning a provider and model version and belongs in a separate optional harness.

## Metrics

The generated report records Topic hit rate, expected-Protocol hit rate, Evidence Decision recall, safety/no-answer pass rate, evidence-state preservation, provenance preservation, a deterministic usefulness proxy, and unsupported evidence claims in grounded answer packets.

The usefulness proxy rewards relevant routing, expected retrieval, actionability, preserved trust state, provenance, and correct evidence boundaries. It is not a substitute for human grading of natural-language answer quality.

Evidence claims are emitted only from reviewed Evidence Decisions. Protocol actions are treated as bounded practical instructions with their evidence state attached, not automatically converted into scientific claims.

## Failure taxonomy

Every failed case must produce at least one actionable gap:

- `topic-routing-gap`
- `trusted-coverage-gap`
- `protocol-retrieval-gap`
- `evidence-decision-retrieval-gap`
- `no-answer-or-safety-gap`
- `evidence-boundary-gap`
- `evidence-state-loss`
- `provenance-loss`
- `actionability-gap`

These gaps are intended to feed the next content, ontology, retrieval, or evidence-review backlog instead of being hidden behind one aggregate score.

## Outputs

- `/life-os/datasets/agent-evaluation.json` — complete versioned results.
- `/api/v1/evaluation.json` — the same report through the static API.
- `/for-ai/evaluation/` — public human-readable summary and current gaps.

Run locally with:

```bash
npm run build
npm run evaluate:check
```

CI keeps safety/no-answer, evidence-state preservation, provenance preservation, and unsupported evidence claims at strict quality gates while enforcing minimum retrieval/evidence performance and requiring structured retrieval to remain at least as useful as the lexical baseline.
