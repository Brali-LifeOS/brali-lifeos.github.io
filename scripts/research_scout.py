#!/usr/bin/env python3
"""Discover recent scholarly records for the Brali research queue.

Uses the public Crossref REST API. Discovery metadata is deliberately kept
separate from evidence review: this script never promotes content to reviewed.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, os, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DEFAULT_QUERIES=ROOT/"data"/"research-queries.json"; DEFAULT_OUTPUT=ROOT/"data"/"research-candidates.json"
API="https://api.crossref.org/works"; USER_AGENT="BraliResearchScout/1.0 (https://brali-lifeos.github.io/research/)"

def parse_args():
    p=argparse.ArgumentParser(); p.add_argument("--days",type=int,default=60); p.add_argument("--rows",type=int,default=8); p.add_argument("--max-candidates",type=int,default=250); p.add_argument("--queries",type=Path,default=DEFAULT_QUERIES); p.add_argument("--output",type=Path,default=DEFAULT_OUTPUT); return p.parse_args()
def load_json(path): return json.loads(path.read_text(encoding="utf-8"))
def now_iso(): return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")
def published_date(item):
    for key in ("published-online","published-print","issued"):
        parts=item.get(key,{}).get("date-parts")
        if not parts or not parts[0]: continue
        v=parts[0]; y=v[0]; m=v[1] if len(v)>1 else 1; d=v[2] if len(v)>2 else 1
        try: return dt.date(y,m,d).isoformat()
        except ValueError: return str(y)
    return None
def authors(item):
    out=[]
    for a in item.get("author",[])[:12]:
        name=" ".join(x for x in [a.get("given"),a.get("family")] if x)
        if name: out.append(name)
    return out
def title_of(item):
    titles=item.get("title") or []; return " ".join(titles[0].split()) if titles else "(untitled record)"
def stable_id(item):
    doi=(item.get("DOI") or "").strip().lower() or None
    if doi: return f"crossref:{doi}",doi,doi
    url=(item.get("URL") or title_of(item)).strip(); digest=hashlib.sha256(url.encode()).hexdigest()[:20]; return f"crossref:{digest}",url,None
def fetch(query,from_date,rows,mailto):
    params={"query.bibliographic":query["query"],"filter":f"from-pub-date:{from_date},type:journal-article","rows":str(rows)}
    if mailto: params["mailto"]=mailto
    req=urllib.request.Request(API+"?"+urllib.parse.urlencode(params),headers={"User-Agent":USER_AGENT,"Accept":"application/json"}); last=None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req,timeout=30) as response: payload=json.load(response)
            return payload.get("message",{}).get("items",[])
        except (urllib.error.URLError,urllib.error.HTTPError,TimeoutError) as exc: last=exc; time.sleep(1.5*(attempt+1))
    raise RuntimeError(f"Crossref request failed for {query['id']}: {last}")
def merge_candidate(existing,item,query,timestamp):
    cid,source_id,doi=stable_id(item); reference_url=f"https://doi.org/{doi}" if doi else (item.get("URL") or "https://api.crossref.org")
    base=existing.copy() if existing else {"id":cid,"source":"crossref","source_id":source_id,"doi":doi,"title":title_of(item),"authors":authors(item),"container_title":(item.get("container-title") or [None])[0],"publication_date":published_date(item),"type":item.get("type"),"subjects":sorted(set(item.get("subject") or []))[:20],"reference_url":reference_url,"discovered_at":timestamp,"last_seen_at":timestamp,"status":"new","query_ids":[],"life_area_slugs":[],"zone_slugs":[],"risk_flags":[],"crossref_score":item.get("score"),"review_notes":""}
    base["last_seen_at"]=timestamp; base["query_ids"]=sorted(set(base.get("query_ids",[]))|{query["id"]}); base["life_area_slugs"]=sorted(set(base.get("life_area_slugs",[]))|{query["life_area_slug"]}); base["zone_slugs"]=sorted(set(base.get("zone_slugs",[]))|set(query.get("zone_slugs",[]))); base["risk_flags"]=sorted(set(base.get("risk_flags",[]))|set(query.get("risk_flags",[])))
    if base.get("crossref_score") is None: base["crossref_score"]=item.get("score")
    return base
def main():
    args=parse_args(); config=load_json(args.queries); existing=load_json(args.output) if args.output.exists() else {"candidates":[]}; by_id={x["id"]:x for x in existing.get("candidates",[])}; timestamp=now_iso(); from_date=(dt.date.today()-dt.timedelta(days=max(args.days,1))).isoformat(); mailto=os.environ.get("CROSSREF_MAILTO") or None; successful=0; seen=set()
    for query in config["queries"]:
        try: items=fetch(query,from_date,max(1,min(args.rows,100)),mailto); successful+=1
        except RuntimeError as exc: print(exc); continue
        for item in items:
            cid,_,_=stable_id(item); by_id[cid]=merge_candidate(by_id.get(cid),item,query,timestamp); seen.add(cid)
    if successful==0: raise SystemExit("All research discovery queries failed; existing queue left unchanged.")
    rank={"screening":0,"support-existing":1,"challenge-existing":1,"propose-hack":1,"propose-protocol":1,"watch":2,"new":3,"rejected":4}; candidates=list(by_id.values()); candidates.sort(key=lambda c:(rank.get(c.get("status"),9),-(float(c.get("crossref_score") or 0)),c.get("publication_date") or "",c["id"])); candidates=candidates[:max(1,args.max_candidates)]
    output={"schema_version":1,"generated_at":timestamp,"source":"crossref","note":"Automated discovery queue. Entries here are unreviewed leads, not trusted evidence or publishable hacks.","candidates":candidates}; args.output.parent.mkdir(parents=True,exist_ok=True); args.output.write_text(json.dumps(output,indent=2,ensure_ascii=False)+"\n",encoding="utf-8"); print(f"Research scout: {successful}/{len(config['queries'])} queries succeeded; {len(seen)} records seen; {len(candidates)} candidates retained."); return 0
if __name__=="__main__": raise SystemExit(main())
