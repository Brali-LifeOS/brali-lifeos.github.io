#!/usr/bin/env python3
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8'))
def fail(msg): raise SystemExit(f'research-provider check failed: {msg}')
allowed={'crossref','europepmc'}
queue=load('data/research-candidates.json'); schema=load('contracts/research-candidate.schema.json')
source_enum=set(schema.get('properties',{}).get('source',{}).get('enum',[]))
if not allowed <= source_enum: fail(f'candidate contract is missing providers: {sorted(allowed-source_enum)}')
keys=set()
for item in queue.get('candidates',[]):
    source=item.get('source')
    if source not in allowed: fail(f"{item.get('id')} has unsupported source {source}")
    discovery=set(item.get('discovery_sources',[]))
    if discovery-allowed: fail(f"{item.get('id')} has unknown discovery source(s)")
    key=f"doi:{str(item.get('doi')).lower()}" if item.get('doi') else (f"pmid:{item.get('pmid')}" if item.get('pmid') else f"url:{item.get('reference_url')}")
    if key in keys: fail(f'duplicate scholarly identity: {key}')
    keys.add(key)
print(f"research-provider check passed: {len(keys)} candidates; providers={','.join(sorted(allowed))}; discovery provenance remains separate from evidence review")
