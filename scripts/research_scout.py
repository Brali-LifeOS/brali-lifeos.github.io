#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, json, os, sys, urllib.parse, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
CROSSREF = "https://api.crossref.org/works"
EUROPE_PMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
def load(path: Path): return json.loads(path.read_text(encoding="utf-8"))
def iso_now():
    epoch=os.getenv("SOURCE_DATE_EPOCH"); when=dt.datetime.fromtimestamp(int(epoch),tz=dt.timezone.utc) if epoch else dt.datetime.now(dt.timezone.utc); return when.replace(microsecond=0).isoformat().replace("+00:00","Z")
def normalize_doi(value):
    if not value: return None
    value=str(value).strip().lower()
    for prefix in ("https://doi.org/","http://doi.org/","doi:"):
        if value.startswith(prefix): value=value[len(prefix):]
    return value or None
def date_string(parts):
    if not parts: return None
    try:
        values=list(parts[0]); y=int(values[0]); m=int(values[1]) if len(values)>1 else 1; d=int(values[2]) if len(values)>2 else 1; return dt.date(y,m,d).isoformat()
    except Exception: return None
def http_json(url,headers=None):
    req=urllib.request.Request(url,headers={"User-Agent":"Brali-Research-Scout/2.0",**(headers or {})})
    with urllib.request.urlopen(req,timeout=30) as response: return json.load(response)
def fetch_crossref(query,rows,mailto,since):
    params={"query.bibliographic":query,"rows":rows,"select":"DOI,title,author,container-title,published,type,subject,URL,score","filter":f"from-pub-date:{since}"}
    if mailto: params["mailto"]=mailto
    doc=http_json(f"{CROSSREF}?{urllib.parse.urlencode(params)}"); out=[]
    for item in doc.get("message",{}).get("items",[]):
        doi=normalize_doi(item.get("DOI")); title=(item.get("title") or [""])[0].strip()
        if not title: continue
        authors=[" ".join(filter(None,[a.get("given"),a.get("family")])).strip() for a in item.get("author",[])]
        out.append({"provider":"crossref","source_id":doi or item.get("URL") or title,"doi":doi,"pmid":None,"title":title,"authors":[a for a in authors if a],"container_title":(item.get("container-title") or [None])[0],"publication_date":date_string((item.get("published") or {}).get("date-parts")),"type":item.get("type"),"subjects":item.get("subject") or [],"reference_url":f"https://doi.org/{doi}" if doi else item.get("URL"),"crossref_score":item.get("score")})
    return out
def fetch_europepmc(query,rows,mailto,since):
    scoped=f'FIRST_PDATE:[{since} TO *] AND ({query})'; params={"query":scoped,"format":"json","resultType":"lite","pageSize":rows}
    if mailto: params["email"]=mailto
    doc=http_json(f"{EUROPE_PMC}?{urllib.parse.urlencode(params)}"); out=[]
    for item in doc.get("resultList",{}).get("result",[]):
        title=str(item.get("title") or "").strip()
        if not title: continue
        doi=normalize_doi(item.get("doi")); pmid=item.get("pmid"); source_id=doi or f"{item.get('source','MED')}:{item.get('id') or pmid}"; ref=f"https://doi.org/{doi}" if doi else f"https://europepmc.org/article/{item.get('source','MED')}/{item.get('id') or pmid}"; authors=[x.strip() for x in str(item.get("authorString") or "").split(",") if x.strip()]
        out.append({"provider":"europepmc","source_id":source_id,"doi":doi,"pmid":pmid,"title":title,"authors":authors,"container_title":item.get("journalTitle"),"publication_date":item.get("firstPublicationDate") or item.get("firstIndexDate"),"type":item.get("pubType"),"subjects":[],"reference_url":ref,"crossref_score":None})
    return out
PROVIDERS={"crossref":fetch_crossref,"europepmc":fetch_europepmc}
def identity_key(candidate):
    if candidate.get("doi"): return f"doi:{normalize_doi(candidate['doi'])}"
    if candidate.get("pmid"): return f"pmid:{candidate['pmid']}"
    return f"url:{candidate.get('reference_url') or candidate.get('id')}"
def make_candidate(source,query,now):
    provider=source["provider"]; sid=source["source_id"]
    return {"id":f"{provider}:{sid}","source":provider,"source_id":sid,"doi":source.get("doi"),"pmid":source.get("pmid"),"title":source["title"],"authors":source.get("authors",[]),"container_title":source.get("container_title"),"publication_date":source.get("publication_date"),"type":source.get("type"),"subjects":source.get("subjects",[]),"reference_url":source["reference_url"],"discovered_at":now,"last_seen_at":now,"status":"new","query_ids":[query["id"]],"domain_ids":sorted(set(query.get("domain_ids",[]))),"topic_ids":sorted(set(query.get("topic_ids",[]))),"method_ids":sorted(set(query.get("method_ids",[]))),"lens_ids":sorted(set(query.get("lens_ids",[]))),"life_area_slugs":[query["life_area_slug"]],"zone_slugs":sorted(set(query.get("zone_slugs",[]))),"risk_flags":sorted(set(query.get("risk_flags",[]))),"crossref_score":source.get("crossref_score"),"discovery_sources":[provider]}
def merge_candidate(old,new):
    merged=dict(old)
    for field in ("query_ids","domain_ids","topic_ids","method_ids","lens_ids","life_area_slugs","zone_slugs","risk_flags","discovery_sources"): merged[field]=sorted(set(old.get(field,[]))|set(new.get(field,[])))
    merged["last_seen_at"]=new["last_seen_at"]
    if not merged.get("doi") and new.get("doi"): merged["doi"]=new["doi"]
    if not merged.get("pmid") and new.get("pmid"): merged["pmid"]=new["pmid"]
    if not merged.get("reference_url") and new.get("reference_url"): merged["reference_url"]=new["reference_url"]
    return merged
def merge_candidates(existing,discovered):
    by_key={identity_key(c):dict(c) for c in existing}
    for candidate in discovered:
        key=identity_key(candidate); by_key[key]=merge_candidate(by_key[key],candidate) if key in by_key else candidate
    return sorted(by_key.values(),key=lambda x:(x.get("status") not in {"new","screening"},x.get("publication_date") or "",x.get("title") or ""),reverse=True)
def main():
    parser=argparse.ArgumentParser(description="Discover unreviewed research leads from provider-neutral metadata sources.")
    parser.add_argument("--queries",default="data/research-queries.json"); parser.add_argument("--output",default="data/research-candidates.json"); parser.add_argument("--rows",type=int,default=8); parser.add_argument("--days",type=int,default=60); parser.add_argument("--providers",default=os.getenv("BRALI_RESEARCH_PROVIDERS","crossref,europepmc")); parser.add_argument("--mailto",default=os.getenv("CROSSREF_MAILTO") or os.getenv("EUROPEPMC_EMAIL")); parser.add_argument("--dry-run",action="store_true"); args=parser.parse_args()
    now=iso_now(); since=(dt.date.today()-dt.timedelta(days=args.days)).isoformat(); queries=load(ROOT/args.queries); output=ROOT/args.output; queue=load(output) if output.exists() else {"schema_version":2,"candidates":[]}; providers=[p.strip().lower() for p in args.providers.split(",") if p.strip()]; unknown=[p for p in providers if p not in PROVIDERS]
    if unknown: raise SystemExit(f"unknown providers: {', '.join(unknown)}")
    discovered=[]; failures=[]
    for query in queries.get("queries",[]):
        for provider in providers:
            try:
                for source in PROVIDERS[provider](query["query"],args.rows,args.mailto,since): discovered.append(make_candidate(source,query,now))
            except Exception as error:
                failures.append(f"{provider}/{query['id']}: {error}"); print(f"research scout warning: {failures[-1]}",file=sys.stderr)
    merged=merge_candidates(queue.get("candidates",[]),discovered); result={"schema_version":2,"generated_at":now,"source":"multi-provider" if len(providers)>1 else providers[0],"providers":providers,"note":"Research discovery queue. Metadata is an unreviewed lead, never publishable evidence. Provider provenance is preserved in discovery_sources.","candidates":merged}; print(json.dumps({"providers":providers,"discovered":len(discovered),"candidates":len(merged),"provider_failures":len(failures)},indent=2))
    if not args.dry_run: output.write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
if __name__=="__main__": main()
