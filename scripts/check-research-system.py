#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(path): return json.loads((ROOT/path).read_text(encoding="utf-8"))
def fail(message): raise SystemExit(f"research-system check failed: {message}")
areas=load("data/life-areas.json"); zones=load("data/life-os-zones.json"); queries=load("data/research-queries.json"); queue=load("data/research-candidates.json")
area_slugs={a["slug"] for a in areas}; zone_slugs={z["slug"] for z in zones}; query_ids=set()
for q in queries.get("queries",[]):
    qid=q.get("id")
    if not qid or qid in query_ids: fail(f"duplicate or missing query id: {qid}")
    query_ids.add(qid)
    if q.get("life_area_slug") not in area_slugs: fail(f"{qid} references unknown life area {q.get('life_area_slug')}")
    unknown=set(q.get("zone_slugs",[]))-zone_slugs
    if unknown: fail(f"{qid} references unknown zones: {sorted(unknown)}")
    if not q.get("query"): fail(f"{qid} has empty search text")
candidate_ids=set(); allowed={"new","screening","watch","rejected","support-existing","challenge-existing","propose-hack","propose-protocol"}
for c in queue.get("candidates",[]):
    cid=c.get("id")
    if not cid or cid in candidate_ids: fail(f"duplicate or missing candidate id: {cid}")
    candidate_ids.add(cid)
    if c.get("status") not in allowed: fail(f"{cid} has invalid candidate status {c.get('status')}")
    if c.get("status")=="reviewed": fail(f"{cid} illegally promotes discovery metadata to reviewed evidence")
    if set(c.get("query_ids",[]))-query_ids: fail(f"{cid} references unknown query ids")
    if set(c.get("life_area_slugs",[]))-area_slugs: fail(f"{cid} references unknown life areas")
    if set(c.get("zone_slugs",[]))-zone_slugs: fail(f"{cid} references unknown zones")
    for field in ("source","source_id","title","reference_url","discovered_at","last_seen_at"):
        if not c.get(field): fail(f"{cid} missing {field}")

schema_paths=("contracts/hack.schema.json","contracts/protocol.schema.json","contracts/research-candidate.schema.json","contracts/evidence-decision.schema.json")
schemas={path:load(path) for path in schema_paths}
for path,doc in schemas.items():
    if doc.get("$schema")!="https://json-schema.org/draft/2020-12/schema": fail(f"{path} is not draft 2020-12")
    if not doc.get("$id") or not doc.get("title"): fail(f"{path} missing identity metadata")

hack=schemas["contracts/hack.schema.json"]
hack_source_required=set(hack.get("$defs",{}).get("source",{}).get("required",[]))
if not {"url","title","source_type","claim_scope"} <= hack_source_required: fail("hack source contract does not require traceable claim-scoped provenance")
if not hack.get("allOf"): fail("hack contract does not enforce research-derived provenance")

protocol=schemas["contracts/protocol.schema.json"]
protocol_source_required=set(protocol.get("properties",{}).get("evidence",{}).get("properties",{}).get("sources",{}).get("items",{}).get("required",[]))
if not {"url","title","source_type","claim_scope"} <= protocol_source_required: fail("protocol source contract does not require traceable claim-scoped provenance")

decision=schemas["contracts/evidence-decision.schema.json"]
if not {"source_url","source_title","source_type","source_reviewed","supported_claim","limitations"} <= set(decision.get("required",[])): fail("evidence decision contract is missing source provenance requirements")

policy=ROOT/"SOURCE_POLICY.md"
if not policy.exists() or "public page must show" not in policy.read_text(encoding="utf-8").lower(): fail("SOURCE_POLICY.md is missing the public source-display rule")

skill_paths=("skills/research-discovery/SKILL.md","skills/evidence-review/SKILL.md","skills/protocol-design/SKILL.md")
for path in skill_paths:
    text=(ROOT/path).read_text(encoding="utf-8")
    if "SOURCE_POLICY.md" not in text: fail(f"{path} does not load the source policy")

for path in ("agents/registry.json","skills/research-discovery/SKILL.md","skills/evidence-review/SKILL.md","skills/protocol-design/SKILL.md","skills/taxonomy-curation/SKILL.md"):
    if not (ROOT/path).exists(): fail(f"missing {path}")
print(f"research-system check passed: {len(query_ids)} queries, {len(candidate_ids)} candidates; source provenance enforced")
