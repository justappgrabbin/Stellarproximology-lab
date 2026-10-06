import { calculateChart, calculateGeonatalChart, compareRelationship, analyzeTiming, humanDesignResolution, normalizeLongitude, AXES } from './BiverseCore.mjs';
import { eclipticLongitude } from './GeonatalEngine.mjs';
import { GATE_NAMES, activationSentence } from './knowledge.mjs';

export { calculateChart, calculateGeonatalChart, compareRelationship, analyzeTiming, AXES };

export const PLANETS = ['Sun','Earth','North Node','South Node','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
export const ZODIAC = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
export const CENTER_THEMES = {
  Head:['inspiration','pressure to answer everything'], Ajna:['conceptual awareness','pretending certainty'],
  Throat:['expression and manifestation','trying to attract attention'], G:['identity, love and direction','searching outside for identity'],
  Heart:['will, value and promises','proving worth'], Spleen:['instinct, immunity and timing','holding what is unhealthy'],
  'Solar Plexus':['emotional awareness and waves','avoiding truth or confrontation'], Sacral:['sustainable life force','not knowing when enough is enough'],
  Root:['pressure and momentum','rushing to be free of pressure']
};
export const TYPE_GUIDANCE = {
  generator:['Respond to what is actually present; then let Sacral availability decide.','Satisfaction','Frustration'],
  'manifesting-generator':['Respond first, allow the body to commit, then inform people affected by the movement.','Satisfaction','Frustration'],
  manifestor:['Let the inner authority settle, then inform those affected before initiating.','Peace','Anger'],
  projector:['Invest in mastery and visibility; reserve major guidance for correct recognition and invitation.','Success','Bitterness'],
  reflector:['Sample places and people; give major identity-changing decisions a lunar cycle.','Surprise','Disappointment']
};
export const AUTHORITY_GUIDANCE = {
  emotional:'No truth in the now. Revisit the decision across the emotional wave before committing.',
  sacral:'Use an immediate bodily yes/no response to something concrete—not a mental hypothetical.',
  splenic:'Notice the quiet, present-tense instinct once; it rarely repeats or argues.',
  ego:'Listen for what you genuinely have the will to promise and what is worth the bargain.',
  'self-projected':'Hear your direction emerge while speaking to a trusted listener who does not advise.',
  environmental:'Use trusted people as sounding boards and hear your own mental clarity in the correct place.',
  lunar:'Watch the decision move through people, places and the lunar cycle before fixing it.'
};

const lc = s => String(s).toLowerCase();
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
const fmt = n => Number(n).toFixed(2);

export function inputTimestamp(date,time,offset='+00:00') {
  const value = `${date}T${time}:00${offset}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Birth date, time, and UTC offset must form a valid moment.');
  return parsed;
}

export function canonicalAddress(placement) {
  const planet = PLANETS.indexOf(placement.planetary)+1;
  const dimension = {movement:1,evolution:2,being:3,design:4,space:5}[lc(placement.dimension)] || 3;
  const arc = Math.floor(normalizeLongitude(placement.longitude) / 3.6);
  return {
    planetary:planet, dimension, gate:placement.gate, line:placement.line, color:placement.color,
    tone:placement.tone, base:placement.base, degree:placement.degree, minute:placement.minute,
    second:placement.second, arc, zodiac:placement.zodiac, house:placement.house
  };
}

export function addressText(a) {
  return `Planetary ${a.planetary} → Dimension ${a.dimension} → Gate ${a.gate} → Line ${a.line} → Color ${a.color} → Tone ${a.tone} → Base ${a.base} → Degree ${a.degree} → Minute ${a.minute} → Second ${a.second} → Arc/Axis ${a.arc} → Zodiac ${a.zodiac} → House ${a.house}`;
}

const PHS = {
  determination:['Appetite','Taste','Thirst','Touch','Sound','Light'],
  determinationL:['Consecutive','Open','Hot','Calm','High','Direct'],
  determinationR:['Alternating','Closed','Cold','Nervous','Low','Indirect'],
  cognition:['Smell','Taste','Outer Vision','Inner Vision','Feeling','Touch'],
  environment:['Caves','Markets','Kitchens','Mountains','Valleys','Shores'],
  environmentL:['Selective','Internal','Wet','Active','Narrow','Natural'],
  environmentR:['Blending','External','Dry','Passive','Wide','Artificial'],
  motivation:['Fear','Hope','Desire','Need','Guilt','Innocence'],
  transference:['Need','Guilt','Innocence','Fear','Hope','Desire'],
  perspective:['Survival','Possibility','Power','Wanting','Probability','Personal'],
  distraction:['Wanting','Probability','Personal','Survival','Possibility','Power']
};

function arrow(tone){ return tone <= 3 ? {orientation:'L',label:'strategic/active'} : {orientation:'R',label:'receptive/peripheral'}; }
export function deriveVariables(chart) {
  const p = chart.geonatal.placements.filter(x=>x.frame==='tropical');
  const get=(o,b)=>p.find(x=>x.orientation===o&&x.planetary===b);
  const dSun=get('design','Sun'), dNode=get('design','North Node'), pSun=get('personality','Sun'), pNode=get('personality','North Node');
  const items=[['Digestion',dSun],['Environment',dNode],['Perspective',pNode],['Awareness',pSun]].map(([role,x])=>({role,color:x.color,tone:x.tone,base:x.base,...arrow(x.tone)}));
  const [dig,env,view,mind]=items;
  return {
    code:`P${mind.orientation}${view.orientation} D${dig.orientation}${env.orientation}`,
    items,
    determination:{color:dig.color,name:PHS.determination[dig.color-1],variant:(dig.orientation==='L'?PHS.determinationL:PHS.determinationR)[dig.color-1],cognition:PHS.cognition[dig.tone-1]},
    environment:{color:env.color,name:PHS.environment[env.color-1],variant:(env.orientation==='L'?PHS.environmentL:PHS.environmentR)[env.color-1],sense:PHS.cognition[env.tone-1]},
    mind:{motivation:PHS.motivation[mind.color-1],transference:PHS.transference[mind.color-1],tone:PHS.cognition[mind.tone-1]},
    view:{perspective:PHS.perspective[view.color-1],distraction:PHS.distraction[view.color-1],tone:PHS.cognition[view.tone-1]},
    note:'PHS and Variables are derived from substructure. Treat them as experiment prompts; the bundled low-precision ephemeris can change Color/Tone/Base near boundaries.'
  };
}

const GRID={Moon:[0,0,'Alpha','Voice'],Venus:[1,0,'Alpha','Heart'],Saturn:[2,0,'Alpha','Mind'],Mercury:[0,1,'Beta','Voice'],Mars:[1,1,'Beta','Heart'],Jupiter:[2,1,'Beta','Mind'],Uranus:[0,2,'Gamma','Voice'],Neptune:[1,2,'Gamma','Heart'],Pluto:[2,2,'Gamma','Mind']};
const SYMBOL={Moon:'☽',Venus:'♀',Saturn:'♄',Mercury:'☿',Mars:'♂',Jupiter:'♃',Uranus:'♅',Neptune:'♆',Pluto:'♇'};
export function buildMagicSquare(chart,orientation='personality') {
  const source=chart.geonatal.placements.filter(x=>x.frame==='tropical'&&x.orientation===orientation);
  const cells=Object.entries(GRID).map(([planet,[x,y,vertical,lateral]])=>{const p=source.find(v=>v.planetary===planet);return {planet,symbol:SYMBOL[planet],x,y,vertical,lateral,isMars:planet==='Mars',gate:p.gate,line:p.line,color:p.color,tone:p.tone,base:p.base};});
  return {orientation,cells,verticals:[['Voice','Moon','Mercury','Uranus'],['Heart','Venus','Mars','Neptune'],['Mind','Saturn','Jupiter','Pluto']],laterals:[['Foundation','Moon','Venus','Saturn'],['Outer Authority','Mercury','Mars','Jupiter'],['Learning','Uranus','Neptune','Pluto']]};
}

function progressedDate(birth,at){
  const years=(at.getTime()-birth.getTime())/(365.2425*86400000);
  return new Date(birth.getTime()+years*86400000);
}
function zodiacPosition(lon){const n=normalizeLongitude(lon),z=Math.floor(n/30);return {longitude:n,sign:ZODIAC[z],degree:n%30};}
function aspect(a,b,orb=3){const d=Math.abs(((a-b+540)%360)-180);const defs=[[0,'conjunction'],[60,'sextile'],[90,'square'],[120,'trine'],[180,'opposition']];const hit=defs.map(([angle,name])=>({angle,name,orb:Math.abs(d-angle)})).sort((x,y)=>x.orb-y.orb)[0];return hit.orb<=orb?hit:null;}

export function calculateTiming(natal,at=new Date()) {
  const birth=new Date(natal.metadata.timestamp); const progressed=progressedDate(birth,at);
  const natalP=natal.geonatal.placements.filter(x=>x.frame==='tropical'&&x.orientation==='personality');
  const bodies=PLANETS.filter(x=>!x.includes('Node')&&x!=='Earth');
  const transits=bodies.map(planet=>({planet,...zodiacPosition(eclipticLongitude(planet,at)),...humanDesignResolution(eclipticLongitude(planet,at))}));
  const secondary=bodies.map(planet=>({planet,...zodiacPosition(eclipticLongitude(planet,progressed)),...humanDesignResolution(eclipticLongitude(planet,progressed))}));
  const natalSun=natalP.find(x=>x.planetary==='Sun').longitude, progSun=secondary.find(x=>x.planet==='Sun').longitude;
  const solarArc=normalizeLongitude(progSun-natalSun);
  const solarArcPositions=natalP.filter(x=>bodies.includes(x.planetary)).map(x=>({planet:x.planetary,...zodiacPosition(x.longitude+solarArc),...humanDesignResolution(x.longitude+solarArc)}));
  const aspects=[];
  for(const moving of transits) for(const fixed of natalP.filter(x=>bodies.includes(x.planetary))){const hit=aspect(moving.longitude,fixed.longitude);if(hit)aspects.push({moving:moving.planet,natal:fixed.planetary,...hit});}
  aspects.sort((a,b)=>a.orb-b.orb);
  return {at:at.toISOString(),progressedDate:progressed.toISOString(),solarArc,transits,secondary,solarArcPositions,aspects:aspects.slice(0,18),method:'Secondary progression uses one ephemeris day after birth per tropical year; solar arc applies progressed-Sun arc to natal longitudes.'};
}

export function composite(first,second){
  const relationship=compareRelationship(first,second);
  const A=new Set(first.activeGates),B=new Set(second.activeGates);
  const electromagnetic=[];
  for(const channel of [...first.field.channels,...second.field.channels]){
    const [a,b]=channel.gates;if((A.has(a)&&B.has(b))||(A.has(b)&&B.has(a)))electromagnetic.push(channel);
  }
  return {...relationship,electromagnetic:[...new Map(electromagnetic.map(x=>[x.code,x])).values()]};
}

export function chartSummary(chart){
  const guide=TYPE_GUIDANCE[chart.type]||['Experiment with strategy and authority.','',''];
  return `${title(chart.type)} with ${title(chart.authority)} authority, ${chart.profile} profile, ${chart.definition} definition. ${guide[0]} Authority: ${AUTHORITY_GUIDANCE[chart.authority]||'Use the body rather than mental pressure for decisions.'}`;
}
const title=s=>String(s).replace(/\b\w/g,c=>c.toUpperCase());

export class SynthiaGuide {
  constructor(storage=globalThis.localStorage){this.storage=storage;this.memory=this.load();}
  load(){try{return JSON.parse(this.storage?.getItem('synthia-hd-memory')||'{"observations":[]}')}catch{return {observations:[]}}}
  save(){this.storage?.setItem('synthia-hd-memory',JSON.stringify(this.memory));}
  observe(row){this.memory.observations.push({...row,at:new Date().toISOString()});this.memory.observations=this.memory.observations.slice(-300);this.save();}
  answer(question,ctx){
    if(!ctx?.chart)return {text:'Create or select a chart first. I will ground every explanation in its calculated activations.',evidence:[]};
    const q=lc(question),c=ctx.chart,v=ctx.variables,t=ctx.timing,ev=[];let parts=[];
    if(/overview|who am|chart|design/.test(q)){parts.push(chartSummary(c));ev.push('type','authority','profile','definition');}
    if(/decision|authority|choose|choice/.test(q)){parts.push(`Authority: ${AUTHORITY_GUIDANCE[c.authority]}`);ev.push(`authority:${c.authority}`);}
    if(/food|eat|diet|digestion|phs|body/.test(q)){parts.push(`PHS experiment: ${v.determination.variant} ${v.determination.name}; cognition ${v.determination.cognition}. This is an environmental and sensory experiment, not medical or nutritional treatment.`);ev.push('design Sun color/tone');}
    if(/environment|place|where/.test(q)){parts.push(`Environment: ${v.environment.variant} ${v.environment.name}; environmental sense ${v.environment.sense}. Test qualities rather than taking the label literally.`);ev.push('design Node color/tone');}
    if(/motivation|mind|perspective|view/.test(q)){parts.push(`Motivation ${v.mind.motivation} can transfer to ${v.mind.transference}; perspective ${v.view.perspective} can be distracted by ${v.view.distraction}. Notice the shift—do not use it to police yourself.`);ev.push('personality Sun/Node color');}
    if(/transit|today|timing|progress|astrolog/.test(q)){const top=t.aspects.slice(0,4).map(a=>`${a.moving} ${a.name} natal ${a.natal} (${fmt(a.orb)}°)`).join('; ');parts.push(`Timing for ${new Date(t.at).toLocaleDateString()}: ${top||'no major aspect within the configured 3° orb'}. Secondary-progressed date: ${t.progressedDate.slice(0,10)}; solar arc ${fmt(t.solarArc)}°.`);ev.push('transits','secondary progression','solar arc');}
    if(/channel|center|gate/.test(q)){const suns=c.geonatal.placements.filter(x=>x.frame==='tropical'&&x.planetary==='Sun');parts.push(`Defined centers: ${c.centers.join(', ')||'none'}. Channels: ${c.channels.map(x=>`${x.code} ${x.name}`).join(', ')||'none'}. Active gate field: ${c.activeGates.map(g=>`${g} ${GATE_NAMES[g]}`).join('; ')}.\n\nSun anchors:\n${suns.map(activationSentence).join('\n')}`);ev.push('activated gates','complete channels','canonical Sun addresses');}
    if(/relationship|connect|partner/.test(q)&&ctx.relationship){parts.push(`Connection field: ${ctx.relationship.electromagnetic.map(x=>`${x.code} ${x.name}`).join(', ')||'no electromagnetic completions in this pair'}. Compare mechanics; do not turn the chart into a compatibility verdict.`);ev.push('composite gates');}
    if(/experiment|history|learn/.test(q)){const rows=this.memory.observations,followed=rows.filter(x=>x.followed==='Yes'),good=followed.filter(x=>x.outcome==='Aligned'||x.outcome==='Successful');parts.push(`I hold ${rows.length} local experiment${rows.length===1?'':'s'}. ${followed.length?`${good.length} of ${followed.length} authority-followed entries were marked aligned/successful.`:'There is not enough authority-followed evidence yet.'}`);ev.push('local experiment log');}
    if(!parts.length){parts=[chartSummary(c),`Ask me about decisions, PHS, environment, motivation, centers, gates, relationships, transits, progressions, or your experiment history.`];ev.push('chart mechanics');}
    return {text:parts.join('\n\n'),evidence:ev,accuracy:'Interpretive guidance grounded in the local calculation; not scientific, medical, legal, or financial advice.'};
  }
}
