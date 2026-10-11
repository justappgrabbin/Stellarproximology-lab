export const NAMES = ['Movement', 'Evolution', 'Being', 'Design'];

export function validateUnits(units, dimension, profile) {
  if (!Array.isArray(units) || units.length !== 64) throw Error('Expected 64 units for ' + dimension);
  const seen = new Set();
  for (const unit of units) {
    if (!unit || !/^[01]{6}$/.test(unit.bits) || seen.has(unit.bits)) throw Error('Duplicate or invalid binary identity');
    seen.add(unit.bits);
    if (unit.dimension !== dimension || unit.id !== dimension + ':' + unit.bits) throw Error('Dimension identity was lost');
    if (JSON.stringify(unit.heart) !== JSON.stringify([unit.bits.slice(0,2),unit.bits.slice(2,4),unit.bits.slice(4)])) throw Error('Heart bigrams changed');
    if (JSON.stringify(unit.mind) !== JSON.stringify([unit.bits.slice(0,3),unit.bits.slice(3)])) throw Error('Mind trigrams changed');
    if (unit.body !== unit.bits || unit.tcs != null) throw Error('Body or unresolved TCS mapping changed');
    if (JSON.stringify(unit.perspective) !== JSON.stringify(profile)) throw Error('Perspective profile changed');
  }
  return units;
}

export function sandbox(code, dimension, profile, timeout = 7000) {
  if (typeof code !== 'string' || code.length > 60000) return Promise.reject(Error('Candidate code is too large'));
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('sandbox', 'allow-scripts');
    const nonce = crypto.randomUUID();
    const workerCode = `'use strict';\n${code}\n;postMessage(buildUnits(${JSON.stringify(dimension)},${JSON.stringify(profile)}));`;
    // Opaque-origin frame: no phone storage or parent DOM. Blob worker isolates execution
    // from the UI, with a CSP blocking network access and external scripts.
    const bootstrap = `const source=${JSON.stringify(workerCode).replace(/</g,'\\u003c')};
      const worker=new Worker(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      worker.onmessage=e=>{worker.terminate();parent.postMessage({nonce:${JSON.stringify(nonce)},units:e.data},'*')};
      worker.onerror=e=>{worker.terminate();parent.postMessage({nonce:${JSON.stringify(nonce)},error:e.message},'*')};`;
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'"><script>${bootstrap}<\/script>`;
    const clean = () => {clearTimeout(timer);window.removeEventListener('message',receive);frame.remove()};
    const receive = event => {
      if (event.source !== frame.contentWindow || event.data?.nonce !== nonce) return;
      try {
        const value = event.data;
        if (value.error) throw Error(value.error);
        if (JSON.stringify(value.units).length > 1000000) throw Error('Candidate output exceeded limit');
        const units = validateUnits(value.units, dimension, profile);
        clean(); resolve(units);
      } catch (error) {clean();reject(error)}
    };
    const timer = setTimeout(() => {clean();reject(Error('Candidate timed out'))}, timeout);
    window.addEventListener('message',receive);
    document.body.append(frame);
  });
}

export async function research(query, signal) {
  const params = new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',
    gsrsearch:query.slice(0,300),gsrlimit:'3',prop:'extracts|info',exintro:'1',explaintext:'1',inprop:'url',exchars:'4000'});
  const response = await fetch('https://en.wikipedia.org/w/api.php?' + params, {signal});
  if (!response.ok) throw Error('Research retrieval failed: ' + response.status);
  const data = await response.json();
  return Object.values(data.query?.pages || {}).map(page => ({
    id:'wiki:' + page.pageid, title:page.title, url:page.fullurl,
    text:page.extract || '', status:'retrieved', retrieved_at:new Date().toISOString(),
  }));
}

export async function model(endpoint, access, dimension, stage, prompt, signal) {
  if (!endpoint) throw Error('Connect a private inference service to run live LLM stages');
  const response = await fetch(endpoint.replace(/\/$/,'') + '/api/step', {
    method:'POST', signal,
    headers:{'Content-Type':'application/json',...(access ? {'Authorization':'Bearer ' + access} : {})},
    body:JSON.stringify({dimension,stage,prompt}),
  });
  if (!response.ok) throw Error('Model connection failed: ' + response.status);
  const result = await response.json();
  if (result.error) throw Error(result.error);
  return result;
}

export function offlineCandidate() {
  return `function buildUnits(dimension, profile) {
    return Array.from({length:64}, (_,i) => {
      const bits=i.toString(2).padStart(6,'0');
      return {id:dimension+':'+bits,dimension,bits,heart:[bits.slice(0,2),bits.slice(2,4),bits.slice(4)],
        mind:[bits.slice(0,3),bits.slice(3)],body:bits,tcs:null,perspective:profile};
    });
  }`;
}

export async function runCycle({goal, profiles, endpoint, access, demo=false, onProgress=()=>{}, signal, observations=[]}) {
  const journal = {id:crypto.randomUUID(),started_at:new Date().toISOString(),mode:demo?'offline-demo':'live',
    goal,status:'researching',sources:[],rounds:[],observations};
  const emit = () => onProgress(structuredClone(journal));
  const builtIn = {id:'dimension-profiles',title:'Your dimension perspectives',status:'retrieved',text:JSON.stringify(profiles)};
  journal.sources = [builtIn]; emit();
  if (!demo) {
    try {journal.sources.push(...await research(goal,signal))}
    catch (error) {journal.research_error=error.message}
  }
  let feedback=[];
  for (let attempt=1;attempt<=2;attempt++) {
    const round={attempt,perspectives:{}};journal.rounds.push(round);
    for (const dimension of NAMES) {
      if (signal?.aborted) throw Error('Cycle stopped');
      const slot={status:'researching'};round.perspectives[dimension]=slot;emit();
      const prompt={goal,dimension:{name:dimension,...profiles.dimensions[dimension]},sources:journal.sources,
        source_orders:profiles.source_orders,space:profiles.space,observations,previous_results:feedback,
        contract:'Return JavaScript function buildUnits(dimension, profile). It must return exactly 64 records: '+
          '{id:dimension+":"+bits,dimension,bits,heart:[bits[:2],bits[2:4],bits[4:]],mind:[bits[:3],bits[3:]],body:bits,tcs:null,perspective:profile}. '+
          'Keep the original profile unchanged and enumerate all six binary lines. No network, printing, or file access.'};
      const call = async (stage,schema) => {
        prompt.return_schema=schema;
        return model(endpoint,access,dimension,stage,{...prompt,stage},signal);
      };
      try {
        slot.research=demo ? {findings:[{claim:'This dimension has 64 binary six-line identities.',source_ids:['dimension-profiles']}],unknowns:['TCS remains unresolved']} :
          await call('research',{findings:[{claim:'text',source_ids:['retrieved ID']}],unknowns:['unresolved questions']});
        const ids=new Set(journal.sources.map(s=>s.id));
        if (!Array.isArray(slot.research.findings) || !slot.research.findings.length || slot.research.findings.some(f=>
          !Array.isArray(f.source_ids) || !f.source_ids.length || f.source_ids.some(id=>!ids.has(id)))) throw Error('Research includes unsupported citations');
        slot.status='hypothesizing';emit();prompt.research=slot.research;
        slot.hypothesis=demo ? {hypothesis:'Generate one unit per six-bit pattern.',prediction:'64 distinct records pass the contract.'} :
          await call('hypothesis',{hypothesis:'testable proposal',prediction:'observable test result',uncertainties:['unverified claims']});
        if (!slot.hypothesis.hypothesis || !slot.hypothesis.prediction) throw Error('Missing hypothesis or prediction');
        prompt.hypothesis=slot.hypothesis;slot.status='building';emit();
        const candidate=demo ? {code:offlineCandidate()} : await call('build',{code:'complete JavaScript source defining buildUnits'});
        slot.code=candidate.code;slot.status='verifying';emit();
        slot.units=await sandbox(candidate.code,dimension,profiles.dimensions[dimension]);
        slot.verification={ok:true,count:slot.units.length};slot.status='verified';emit();
        prompt.measured_result=slot.verification;
        slot.reflection=demo ? {interpretation:'Offline candidate passed structural tests; no live model ran.',next_research:[]} :
          await call('reflect',{interpretation:'what this test supports',next_research:['question'],remaining_uncertainty:['unverified claims']});
      } catch (error) {
        if (signal?.aborted) throw Error('Cycle stopped');
        slot.status='failed';slot.error=error.message;
      }
      emit();
    }
    feedback=NAMES.map(d=>({dimension:d,status:round.perspectives[d].status,error:round.perspectives[d].error,
      hypothesis:round.perspectives[d].hypothesis,verification:round.perspectives[d].verification,reflection:round.perspectives[d].reflection}));
    if (NAMES.every(d=>round.perspectives[d].status==='verified')) {
      journal.units=NAMES.flatMap(d=>round.perspectives[d].units);
      journal.capabilities=NAMES.map(d=>({dimension:d,code:round.perspectives[d].code,verified_at:new Date().toISOString()}));
      journal.status='verified';emit();return journal;
    }
  }
  journal.status='blocked';emit();return journal;
}
