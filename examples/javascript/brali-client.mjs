const BASE='https://brali-lifeos.github.io/api/v1';
const query=process.argv.slice(2).join(' ') || 'how can I focus';
const doc=await fetch(`${BASE}/search.json`).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();});
const terms=new Set(query.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(/\s+/).filter(x=>x.length>2));
const results=(doc.items||[]).map(item=>{if(item.kind==='protocol'&&!['reviewed','practical'].includes(item.trust))return null;const hay=`${item.title||''} ${item.search_text||''}`.toLowerCase();const score=[...terms].filter(term=>hay.includes(term)).length;return score?{score,...item}:null;}).filter(Boolean).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,5);
console.log(JSON.stringify({query,results},null,2));
