#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(path): return json.loads((ROOT/path).read_text(encoding="utf-8"))
def fail(message): raise SystemExit(f"research-system check failed: {message}")
areas=load("data/life-areas.json"); zones=load("data/life-os-zones.json"); ontology=load("data/knowledge-ontology.json"); queries=load("data/research-queries.json"); queue=load("data/research-candidates.json"); decisions=load("data/evidence-decisions.json")
area_slugs={a["slug"] for a in areas}; zone_slugs={z["slug"] for z in zones}; domain_ids={x["id"] for x in ontology.get("domains",[])}; topic_ids={x["id"] for x in ontology.get("topics",[])}; method_ids={x["id"] for x in ontology.get("methods",[])}; lens_ids={x["id"] for x in ontology.get("lenses",[])}; query_ids=set()
if queries.get("schema_version") != 2: fail("research query registry must use schema_version 2")
for q in queries.get("queries",[]):
    qid=q.get("id")
    if not qid or qid in query_ids: fail(f"duplicate or missing query id: {qid}")
    query_ids.add(qid)
    if q.get("life_area_slug") not in area_slugs: fail(f"{qid} references unknown life area {q.get('life_area_slug')}")
    unknown=set(q.get("zone_slugs",[]))-zone_slugs
    if unknown: fail(f"{qid} references unknown zones: {sorted(unknown)}")
    if set(q.get("domain_ids",[]))-domain_ids: fail(f"{qid} references unknown ontology domains")
    if set(q.get("topic_ids",[]))-topic_ids: fail(f"{qid} references unknown ontology topics")
    if set(q.get("method_ids",[]))-method_ids: fail(f"{qid} references unknown ontology methods")
    if set(q.get("lens_ids",[]))-lens_ids: fail(f"{qid} references unknown ontology lenses")
    if not q.get("domain_ids") or not q.get("topic_ids"): fail(f"{qid} must have at least one Domain and Topic")
    if not q.get("query"): fail(f"{qid} has empty search text")
candidate_ids=set(); candidate_by_id={}; allowed={"new","screening","watch","rejected","support-existing","challenge-existing","propose-hack","propose-protocol"}
if queue.get("schema_version") != 2: fail("research candidate queue must use schema_version 2")
for c in queue.get("candidates",[]):
    cid=c.get("id")
    if not cid or cid in candidate_ids: fail(f"duplicate or missing candidate id: {cid}")
    candidate_ids.add(cid); candidate_by_id[cid]=c
    if c.get("status") not in allowed: fail(f"{cid} has invalid candidate status {c.get('status')}")
    if c.get("status")=="reviewed": fail(f"{cid} illegally promotes discovery metadata to reviewed evidence")
    if set(c.get("query_ids",[]))-query_ids: fail(f"{cid} references unknown query ids")
    if set(c.get("domain_ids",[]))-domain_ids or not c.get("domain_ids"): fail(f"{cid} has invalid or missing Domain classification")
    if set(c.get("topic_ids",[]))-topic_ids or not c.get("topic_ids"): fail(f"{cid} has invalid or missing Topic classification")
    if set(c.get("method_ids",[]))-method_ids: fail(f"{cid} references unknown ontology methods")
    if set(c.get("lens_ids",[]))-lens_ids: fail(f"{cid} references unknown ontology lenses")
    if set(c.get("life_area_slugs",[]))-area_slugs: fail(f"{cid} references unknown life areas")
    if set(c.get("zone_slugs",[]))-zone_slugs: fail(f"{cid} references unknown zones")
    for field in ("source","source_id","title","reference_url","discovered_at","last_seen_at"):
        if not c.get(field): fail(f"{cid} missing {field}")

if decisions.get("schema_version") != 1: fail("evidence decision registry must use schema_version 1")
decision_ids=set(); decision_allowed={"rejected","watch","support-existing","challenge-existing","propose-hack","propose-protocol"}
for d in decisions.get("entries",[]):
    did=d.get("id"); cid=d.get("candidate_id")
    if not did or did in decision_ids: fail(f"duplicate or missing evidence decision id: {did}")
    decision_ids.add(did)
    if cid not in candidate_ids: fail(f"{did} references unknown research candidate {cid}")
    if d.get("decision") not in decision_allowed: fail(f"{did} has invalid decision {d.get('decision')}")
    if d.get("source_reviewed") is not True: fail(f"{did} must record source_reviewed=true")
    for field in ("reviewed_at","reviewed_by","source_url","source_title","source_type","supported_claim"):
        if not d.get(field): fail(f"{did} missing {field}")
    if not isinstance(d.get("limitations"),list) or not d.get("limitations"): fail(f"{did} must record limitations")
    if d.get("decision")=="propose-protocol" and not d.get("target_protocol_ids"): fail(f"{did} proposes a protocol without a target protocol id")
    if d.get("decision")=="propose-hack" and not d.get("target_hack_ids"): fail(f"{did} proposes a hack without a target hack id")
    if candidate_by_id[cid].get("status") != d.get("decision"):
        fail(f"{did} decision {d.get('decision')} does not match candidate workflow status {candidate_by_id[cid].get('status')}")

schema_paths=("contracts/hack.schema.json","contracts/protocol.schema.json","contracts/research-candidate.schema.json","contracts/evidence-decision.schema.json")
schemas={path:load(path) for path in schema_paths}
for path,doc in schemas.items():
    if doc.get("$schema")!="https://json-schema.org/draft/2020-12/schema": fail(f"{path} is not draft 2020-12")
    if not doc.get("$id") or not doc.get("title"): fail(f"{path} missing identity metadata")

hack=schemas["contracts/hack.schema.json"]
hack_source_required=set(hack.get("$defs",{}).get("source",{}).get("required",[]))
if not {"url","title","source_type","claim_scope"} <= hack_source_required: fail("hack source contract does not require traceable claim-scoped provenance")
if not {"domain_slugs","topic_slugs","method_slugs","lens_slugs"} <= set(hack.get("properties",{})): fail("hack contract is missing ontology v2 fields")
if not hack.get("allOf"): fail("hack contract does not enforce research-derived provenance")

protocol=schemas["contracts/protocol.schema.json"]
protocol_source_required=set(protocol.get("properties",{}).get("evidence",{}).get("properties",{}).get("sources",{}).get("items",{}).get("required",[]))
if not {"url","title","source_type","claim_scope"} <= protocol_source_required: fail("protocol source contract does not require traceable claim-scoped provenance")
if not {"domain_slugs","topic_slugs","method_slugs","lens_slugs"} <= set(protocol.get("properties",{})): fail("protocol contract is missing ontology v2 fields")

candidate=schemas["contracts/research-candidate.schema.json"]
if not {"domain_ids","topic_ids","method_ids","lens_ids"} <= set(candidate.get("required",[])): fail("research candidate contract does not require ontology v2 classification")

decision=schemas["contracts/evidence-decision.schema.json"]
if not {"source_url","source_title","source_type","source_reviewed","supported_claim","limitations"} <= set(decision.get("required",[])): fail("evidence decision contract is missing source provenance requirements")

published_decisions=load("life-os/datasets/evidence-decisions.json") if (ROOT/"life-os/datasets/evidence-decisions.json").exists() else None
if published_decisions is not None and published_decisions.get("count") != len(decision_ids): fail("published evidence decision dataset does not match source registry")

policy=ROOT/"SOURCE_POLICY.md"
if not policy.exists() or "public page must show" not in policy.read_text(encoding="utf-8").lower(): fail("SOURCE_POLICY.md is missing the public source-display rule")

skill_paths=("skills/research-discovery/SKILL.md","skills/evidence-review/SKILL.md","skills/protocol-design/SKILL.md")
for path in skill_paths:
    text=(ROOT/path).read_text(encoding="utf-8")
    if "SOURCE_POLICY.md" not in text: fail(f"{path} does not load the source policy")

for path in ("agents/registry.json","skills/research-discovery/SKILL.md","skills/evidence-review/SKILL.md","skills/protocol-design/SKILL.md","skills/taxonomy-curation/SKILL.md"):
    if not (ROOT/path).exists(): fail(f"missing {path}")
print(f"research-system check passed: {len(query_ids)} ontology-mapped queries, {len(candidate_ids)} candidates, {len(decision_ids)} reviewed evidence decisions; source provenance enforced")
