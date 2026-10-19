import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const paths=process.argv.slice(2);
assert.ok(paths.length,'Usage: node scripts/analyze-playtests.mjs session.json [session.json ...]');
const included=[],excluded=[],seen=new Set();
for(const path of paths){
  const d=JSON.parse(await readFile(path,'utf8')),s=d.session;
  const reasons=[];
  if(d.schema!==2||d.protocol?.id!=='human-fixed-v1')reasons.push('Unsupported protocol');
  if(!s?.id)reasons.push('Missing session ID');
  else if(seen.has(s.id))reasons.push('Duplicate session ID');
  else seen.add(s.id);
  if(s?.source!=='human')reasons.push('Not human evidence');
  if(!s?.complete)reasons.push('Incomplete session');
  if(!s?.build||s.build==='development-unversioned')reasons.push('Unversioned build');
  if(d.records?.length!==26||d.surveys?.length!==2)reasons.push('Unexpected record count');
  if(d.records?.some(r=>r.outcome?.control!=='manual'))reasons.push('Contains nonmanual play');
  if(!Array.isArray(s?.order)||s.order.length!==2||new Set(s.order).size!==2||!s.order.includes('adaptive')||!s.order.includes('selected-fixed'))reasons.push('Invalid condition order');
  if(!['set-a','set-b','neither','unsure'].includes(s?.preference))reasons.push('Invalid preference');
  if(!Array.isArray(d.surveys)||d.surveys.some((q,i)=>q.block!==i||q.condition!==s?.order?.[i]||!q.answers?.noticed?.trim()||!q.answers?.counterplay?.trim()||!['yes','no','unsure'].includes(q.answers?.change)||!['enjoyment','fairness','frustration'].every(k=>Number.isInteger(q.answers?.[k])&&q.answers[k]>=1&&q.answers[k]<=7)))reasons.push('Invalid questionnaire');
  if(reasons.length)excluded.push({path,id:s?.id??null,reasons});else included.push(d);
}
const mean=values=>values.length?values.reduce((s,n)=>s+n,0)/values.length:null;
const ratings=Object.fromEntries(['enjoyment','fairness','frustration'].map(metric=>{
  const pairs=included.map(d=>({id:d.session.id,adaptive:d.surveys.find(s=>s.condition==='adaptive').answers[metric],fixed:d.surveys.find(s=>s.condition==='selected-fixed').answers[metric]}));
  return [metric,{adaptiveMean:mean(pairs.map(p=>p.adaptive)),fixedMean:mean(pairs.map(p=>p.fixed)),pairedDifference:mean(pairs.map(p=>p.adaptive-p.fixed)),pairs}];
}));
const preferences={adaptive:0,'selected-fixed':0,neither:0,unsure:0};
for(const d of included){const p=d.session.preference;preferences[p==='set-a'?d.session.order[0]:p==='set-b'?d.session.order[1]:p]++;}
console.log(JSON.stringify({protocol:'human-fixed-v1',scope:'Descriptive formative analysis only. No p-values or population claims. Keep exclusions visible; manually inspect qualitative evidence and input telemetry.',inputFiles:paths.length,includedHumanSessions:included.length,builds:[...new Set(included.map(d=>d.session.build))],excluded,ratings,preferences,qualitative:included.map(d=>({id:d.session.id,order:d.session.order,surveys:d.surveys,interruptions:d.events.filter(e=>['pause','interruption','error'].includes(e.type))}))},null,2));
