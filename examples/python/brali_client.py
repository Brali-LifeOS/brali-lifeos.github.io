#!/usr/bin/env python3
import json, sys, urllib.request
BASE="https://brali-lifeos.github.io/api/v1"
def get(name):
    with urllib.request.urlopen(f"{BASE}/{name}.json", timeout=15) as response: return json.load(response)
def tokens(text): return {x for x in ''.join(ch.lower() if ch.isalnum() else ' ' for ch in text).split() if len(x)>2}
def main():
    query=' '.join(sys.argv[1:]) or 'how can I focus'
    terms=tokens(query); rows=[]
    for item in get('search').get('items',[]):
        if item.get('kind')=='protocol' and item.get('trust') not in {'reviewed','practical'}: continue
        hay=tokens(f"{item.get('title','')} {item.get('search_text','')}")
        score=len(terms & hay)
        if score: rows.append((score,item))
    for _,item in sorted(rows,key=lambda x:(-x[0],x[1].get('id','')))[:5]: print(json.dumps(item,ensure_ascii=False))
if __name__=='__main__': main()
