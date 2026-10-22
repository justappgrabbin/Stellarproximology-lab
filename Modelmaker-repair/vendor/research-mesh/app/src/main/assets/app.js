
const TABS=["research","intake","sources","concepts","mesh","reports","coder","settings"];
const nav=document.getElementById("nav");
for(const t of TABS){const b=document.createElement("button");b.textContent=t[0].toUpperCase()+t.slice(1);b.onclick=()=>show(t);b.dataset.t=t;nav.appendChild(b)}
function show(t){document.querySelectorAll(".view").forEach(x=>x.classList.remove("on"));document.getElementById(t).classList.add("on");nav.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x.dataset.t===t));render()}
show("research");

const S={
 registry:JSON.parse(localStorage.getItem("srm.registry")||"[]"),
 evidence:JSON.parse(localStorage.getItem("srm.evidence")||"[]"),
 concepts:JSON.parse(localStorage.getItem("srm.concepts")||"[]"),
 edges:JSON.parse(localStorage.getItem("srm.edges")||"[]"),
 reports:JSON.parse(localStorage.getItem("srm.reports")||"[]"),
 settings:JSON.parse(localStorage.getItem("srm.settings")||"{}")
};
let fetchWait={};

function persist(){
 for(const k of ["registry","evidence","concepts","edges","reports"])localStorage.setItem("srm."+k,JSON.stringify(S[k]));
 localStorage.setItem("srm.settings",JSON.stringify(S.settings));
}
function id(prefix="x"){return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7)}
function esc(s){return String(s||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}
function register(o){
 const rec={id:id("reg"),createdAt:new Date().toISOString(),status:"registered",provenance:o.provenance||"user",kind:o.kind||"artifact",title:o.title||"Untitled",text:o.text||"",meta:o.meta||{},relationships:o.relationships||[]};
 S.registry.unshift(rec);persist();return rec;
}
async function loadSeed(){
 if(S.registry.some(x=>x.meta&&x.meta.seed)) return;
 try{
   const r=await fetch("canon-seed.json"); const j=await r.json();
   j.sources.forEach(s=>register({kind:"canon",title:s.origin,text:s.claims.join("\n"),provenance:s.origin,meta:{seed:true,type:s.type}}));
   register({kind:"canon",title:"Hard invariants",text:j.hard_invariants.join("\n"),provenance:"canonical seed",meta:{seed:true}});
 }catch(e){}
}
loadSeed().then(render);

function nativeFetch(url){
 return new Promise((resolve,reject)=>{
   const rid=id("fetch");fetchWait[rid]={resolve,reject};
   if(window.Native&&Native.fetch) Native.fetch(rid,url); else fetch(url).then(r=>r.text()).then(resolve).catch(reject);
   setTimeout(()=>{if(fetchWait[rid]){delete fetchWait[rid];reject(new Error("timeout"))}},35000);
 });
}
window.onNativeFetch=function(payload){
 try{const p=JSON.parse(payload),w=fetchWait[p.id];if(!w)return;delete fetchWait[p.id];p.ok?w.resolve(p.body):w.reject(new Error(p.error||"fetch error"))}catch(e){}
}
window.onDriveImport=function(payload){
 const p=JSON.parse(payload); if(p.error){alert(p.error);return}
 register({kind:"drive-import",title:p.name,text:p.text,provenance:"Android document provider / Google Drive",meta:{provider:"drive-picker"}});
 mineText(p.text,p.name); render(); alert("Registered "+p.name);
}

function registerPaste(){
 const t=document.getElementById("paste").value.trim();if(!t)return;
 register({kind:"conversation",title:"Conversation / note intake",text:t,provenance:"user conversation paste"});
 mineText(t,"conversation");document.getElementById("paste").value="";render();
}
function terms(text){
 const stop=new Set("the and that this with from have into your you are for not but was were will can its they them their what when where who why how our out all use using used one two more has had then than also each only same should would could about over under".split(" "));
 const m=(text.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g)||[]).filter(x=>!stop.has(x));
 const c={};m.forEach(x=>c[x]=(c[x]||0)+1);
 return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,24);
}
function mineText(text,origin){
 const ts=terms(text);
 for(const [name,count] of ts.slice(0,12)){
   let c=S.concepts.find(x=>x.name===name);
   if(!c){c={id:id("c"),name,count:0,origins:[],createdAt:new Date().toISOString()};S.concepts.push(c)}
   c.count+=count;if(!c.origins.includes(origin))c.origins.push(origin);
 }
 // Klein co-activation: derive context signature deterministically
 const active=ts.slice(0,6).map(x=>x[0]).sort();
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
   const a=active[i],b=active[j],context=active.join("|"),sig=hash(context+"::"+a+"::"+b);
   const eid=a+"::"+b+"::"+sig;
   if(!S.edges.some(e=>e.id===eid)){
     const strength=Math.min(1,(ts.find(x=>x[0]===a)?.[1]||1)+(ts.find(x=>x[0]===b)?.[1]||1))/10;
     S.edges.push({id:eid,a,b,relation:"co-active",intensity:+strength.toFixed(2),direction:"bidirectional",context,origin,collapsed:true});
   }
 }
 persist();
}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}

function parseArxiv(xml){
 const out=[]; const entries=xml.split("<entry>").slice(1);
 for(const e of entries.slice(0,8)){
   const title=(e.match(/<title>([\s\S]*?)<\/title>/)||[])[1];
   const sum=(e.match(/<summary>([\s\S]*?)<\/summary>/)||[])[1];
   const link=(e.match(/<id>([\s\S]*?)<\/id>/)||[])[1];
   if(title)out.push({title:cleanXml(title),abstract:cleanXml(sum||""),url:cleanXml(link||""),provider:"arXiv"});
 }return out;
}
function cleanXml(s){return String(s).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
async function researchArxiv(q){
 const u="https://export.arxiv.org/api/query?search_query=all:"+encodeURIComponent(q)+"&start=0&max_results=8&sortBy=relevance&sortOrder=descending";
 const xml=await nativeFetch(u);return parseArxiv(xml);
}
async function researchPubmed(q){
 const s=JSON.parse(await nativeFetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=8&term="+encodeURIComponent(q)));
 const ids=(s.esearchresult&&s.esearchresult.idlist)||[]; if(!ids.length)return [];
 const d=JSON.parse(await nativeFetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id="+ids.join(",")));
 return ids.map(x=>d.result[x]).filter(Boolean).map(x=>({title:x.title||"PubMed article",abstract:(x.sortfirstauthor||"")+" "+(x.pubdate||""),url:"https://pubmed.ncbi.nlm.nih.gov/"+x.uid+"/",provider:"PubMed"}));
}
async function researchGoogle(q){
 const k=S.settings.googleKey,cx=S.settings.googleCx;if(!k||!cx)return [];
 const data=JSON.parse(await nativeFetch("https://www.googleapis.com/customsearch/v1?key="+encodeURIComponent(k)+"&cx="+encodeURIComponent(cx)+"&q="+encodeURIComponent(q)));
 return (data.items||[]).slice(0,8).map(x=>({title:x.title,abstract:x.snippet||"",url:x.link,provider:"Google"}));
}
function localRag(q){
 const qs=new Set(terms(q).slice(0,10).map(x=>x[0]));
 return S.registry.map(r=>{
   const tt=terms(r.text);let score=0;tt.forEach(([t,n])=>{if(qs.has(t))score+=n});
   return {r,score}
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,8).map(x=>({title:x.r.title,abstract:x.r.text.slice(0,700),url:"",provider:"Local/Drive",registryId:x.r.id}));
}
async function runResearch(){
 const q=document.getElementById("question").value.trim();if(!q)return;
 document.getElementById("researchStatus").textContent="ResearchScout active: querying local corpus, arXiv and PubMed…";
 const local=localRag(q);let ax=[],pm=[],gg=[];
 const jobs=[researchArxiv(q).then(x=>ax=x).catch(()=>{}),researchPubmed(q).then(x=>pm=x).catch(()=>{})];
 if(S.settings.googleKey&&S.settings.googleCx)jobs.push(researchGoogle(q).then(x=>gg=x).catch(()=>{}));
 await Promise.all(jobs);
 const found=[...local,...ax,...pm,...gg];
 found.forEach(f=>{
   const ev={id:id("ev"),question:q,title:f.title,excerpt:f.abstract,provider:f.provider,url:f.url||"",retrievedAt:new Date().toISOString(),class:"retrieved-evidence",registryId:f.registryId||null};
   S.evidence.unshift(ev); mineText((f.title||"")+" "+(f.abstract||""),f.provider+":"+f.title);
 });
 register({kind:"research-run",title:q,text:found.map(x=>x.title+"\n"+x.abstract).join("\n\n"),provenance:"ResearchScout",meta:{count:found.length}});
 persist();render();
 document.getElementById("researchStatus").innerHTML="<span class='good'>Research complete.</span> "+found.length+" evidence packets registered.";
}
function googleSearch(){
 const q=document.getElementById("question").value.trim();if(!q)return;
 if(S.settings.googleKey&&S.settings.googleCx){runResearch();return}
 Native.openExternal("https://www.google.com/search?q="+encodeURIComponent(q));
}
function makeConcepts(){
 const q=document.getElementById("question").value.trim();
 if(q)mineText(q,"current-question");
 S.registry.slice(0,8).forEach(r=>mineText(r.text,r.title));render();show("concepts");
}
function evidenceFor(q){
 const tq=new Set(terms(q).slice(0,10).map(x=>x[0]));
 return S.evidence.map(e=>{let s=0;terms(e.title+" "+e.excerpt).forEach(([t,n])=>{if(tq.has(t))s+=n});return {e,s}}).sort((a,b)=>b.s-a.s).slice(0,12).map(x=>x.e);
}
function makeReport(){
 const q=document.getElementById("question").value.trim()||"Current Synthia research state";
 const ev=evidenceFor(q);
 const local=localRag(q);
 const cs=S.concepts.sort((a,b)=>b.count-a.count).slice(0,10);
 const contradictions=[];
 const report=`# ${q}

## Research position
This report was assembled by AutoNovel from registered evidence and current mesh state. Retrieved evidence and generated interpretation are kept separate.

## Direct evidence
${ev.length?ev.map((e,i)=>`${i+1}. **${e.title}** — ${e.provider}\n   ${e.excerpt.slice(0,380)}${e.url?`\n   ${e.url}`:""}`).join("\n\n"):"No external evidence packets have been registered for this question yet."}

## Canon / project evidence
${local.length?local.map((e,i)=>`${i+1}. **${e.title}** — ${e.abstract.slice(0,420)}`).join("\n\n"):"No local RAG hits."}

## Concept structure
${cs.map(c=>`- ${c.name}: witnessed ${c.count} weighted occurrences across ${c.origins.length} origins.`).join("\n")}

## Mesh interpretation
The current context produced ${S.edges.length} witnessed Klein relations. These links are context-resolved relations, not permanent meanings attached to the concepts in isolation.

## Working hypotheses
- Concepts that repeatedly co-activate across independent source origins are candidates for reusable relational operators.
- A Synthia component should be promoted only when its dependencies, evidence trail and tests are registered.
- Research gaps should remain explicit unresolved nodes rather than being filled by architectural normalization.

## Next research actions
1. Search external literature for the strongest unresolved claim.
2. Compare independent terminology through the Language Contact Model.
3. Register contradictions as evidence packets.
4. Ask the coder automaton for the smallest missing executable piece.
5. Re-run AutoNovel after new evidence lands.

## Provenance note
Generated sections above are synthesis, not retrieved evidence. Source packets retain provider, retrieval time and source URL where available.
`;
 const r={id:id("report"),title:q,createdAt:new Date().toISOString(),text:report,evidenceIds:ev.map(x=>x.id)};
 S.reports.unshift(r);register({kind:"report",title:q,text:report,provenance:"AUTONOVEL",relationships:r.evidenceIds});persist();render();show("reports");
}
function runCoder(){
 const p=document.getElementById("coderPrompt").value.trim();if(!p)return;
 const top=terms(p).slice(0,10).map(x=>x[0]);
 const deps=S.concepts.filter(c=>top.includes(c.name)).slice(0,6).map(c=>c.name);
 const name=(p.match(/(?:build|create|make)\s+(?:a|an|the)?\s*([A-Za-z][A-Za-z0-9_-]+)/i)||[])[1]||"SynthiaPiece";
 const cls=name.replace(/[^A-Za-z0-9_$]/g,"")||"SynthiaPiece";
 const code=`// Additive Synthia automaton scaffold
export class ${cls} {
  constructor(mesh, registry) {
    this.id = "${cls}";
    this.mesh = mesh;
    this.registry = registry;
    this.state = "idle";
  }
  async intake(input, provenance) {
    const packet = this.registry.register({
      kind: "${cls}-input",
      provenance,
      payload: input
    });
    this.state = "registered";
    return packet;
  }
  async evaluate(context) {
    // Klein rule: evaluation requires explicit co-active context.
    if (!context || !context.active) throw new Error("Explicit context required");
    const resolved = this.mesh.resolve("${cls}", context);
    this.state = "resolved";
    return resolved;
  }
}`;
 const spec=`## ${cls} additive component proposal

Requested behavior:
${p}

Canonical constraints:
- preserve all existing roles and names
- register every intake/output with provenance
- no fixed Klein relation outside explicit context
- same exact collapsed context returns same result
- generated code remains a proposal until promoted

Dependencies inferred from current mesh:
${deps.length?deps.map(x=>"- "+x).join("\n"):"- registry\n- mesh\n- provenance ledger"}

Interfaces:
- intake(input, provenance) -> RegisteredPacket
- evaluate(context) -> ResolvedPacket
- health() -> status

Tests:
1. rejects missing context
2. repeats identical output for identical collapsed context
3. changes only when context changes
4. never mutates pre-existing registry objects
5. records provenance for every produced artifact

### Scaffold
\`\`\`javascript
${code}
\`\`\`
`;
 register({kind:"coder-proposal",title:cls,text:spec,provenance:"SynthiaCoder",meta:{promotion:"proposal-only"}});
 persist();render();
 document.getElementById("coderOut").innerHTML="<div class='card'><pre>"+esc(spec)+"</pre><button class='btn' onclick='Native.saveText(\""+cls+".md\","+JSON.stringify(spec)+")'>Save proposal</button></div>";
}
function saveSettings(){
 S.settings.googleKey=document.getElementById("googleKey").value.trim();
 S.settings.googleCx=document.getElementById("googleCx").value.trim();persist();alert("Saved on device");
}
function render(){
 const reg=document.getElementById("registry"); if(reg)reg.innerHTML=S.registry.slice(0,40).map(x=>`<div class="source"><b>${esc(x.title)}</b><div class="tiny">${esc(x.kind)} · ${esc(x.provenance)} · ${esc(x.createdAt)}</div></div>`).join("");
 const sl=document.getElementById("sourceList"); if(sl)sl.innerHTML=S.evidence.slice(0,50).map(e=>`<div class="source"><b>${esc(e.title)}</b><div class="tiny">${esc(e.provider)} · ${esc(e.retrievedAt)}</div><div>${esc(e.excerpt).slice(0,500)}</div>${e.url?`<button class="btn" onclick='Native.openExternal(${JSON.stringify(e.url)})'>Open source</button>`:""}</div>`).join("");
 const cl=document.getElementById("conceptList"); if(cl)cl.innerHTML=S.concepts.sort((a,b)=>b.count-a.count).slice(0,80).map(c=>`<div class="node"><b>${esc(c.name)}</b><div class="tiny">weight ${c.count} · ${c.origins.length} origins</div></div>`).join("");
 const ml=document.getElementById("meshList"); if(ml)ml.innerHTML=S.edges.slice(-80).reverse().map(e=>`<div class="node"><b>${esc(e.a)} ↔ ${esc(e.b)}</b><div class="tiny">${esc(e.relation)} · intensity ${e.intensity}<br>context ${esc(e.context).slice(0,90)}</div></div>`).join("");
 const rl=document.getElementById("reportList"); if(rl)rl.innerHTML=S.reports.map((r,i)=>`<div class="report"><b>${esc(r.title)}</b><div class="tiny">${esc(r.createdAt)}</div><pre>${esc(r.text)}</pre><button class="btn" onclick='Native.saveText("synthia-report-${i+1}.md",${JSON.stringify(r.text)})'>Save report</button></div>`).join("");
 if(document.getElementById("googleKey"))document.getElementById("googleKey").value=S.settings.googleKey||"";
 if(document.getElementById("googleCx"))document.getElementById("googleCx").value=S.settings.googleCx||"";
 const rr=document.getElementById("researchResults");if(rr)rr.innerHTML=S.evidence.slice(0,8).map(e=>`<div class="source"><b>${esc(e.title)}</b><div class="tiny">${esc(e.provider)}</div><div>${esc(e.excerpt).slice(0,360)}</div></div>`).join("");
}
