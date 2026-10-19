import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { RESEARCH_SOURCES } from '../research/io.mjs';
import { root } from '../synthetic/io.mjs';
export const ID='opportunity-validation-v2';
export const SOURCES=[...RESEARCH_SOURCES,...['fixtures','trial','metrics','io','worker'].map(x=>`scripts/opportunity-v2/${x}.mjs`),
  'scripts/opportunity-v2.test.mjs','scripts/evaluate-opportunity-v2.mjs','scripts/verify-opportunity-v2.mjs',`docs/experiments/${ID}.protocol.json`];
export const protocol=async()=>JSON.parse(await readFile(resolve(root,`docs/experiments/${ID}.protocol.json`)));
export async function jobs(input,onDone=()=>{}) {
  let next=0,done=0;const results=Array(input.length);
  await Promise.all(Array.from({length:Math.min(4,input.length)},async()=>{
    while(next<input.length) {
      const i=next++;results[i]=await new Promise((resolve,reject)=>{
        const w=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:input[i]});let received=false;
        w.once('message',v=>{received=true;resolve(v);});w.once('error',reject);w.once('exit',c=>{if(c||!received)reject(Error(`Worker exited ${c}`));});
      });onDone(++done,input.length);
    }
  }));return results;
}
export function report(p,s) {
  const rows=Object.entries(s.groups).map(([g,v])=>`| ${g} | ${v.qualified}/${p.seeds.length} | ${v.primary?`${v.primary.meanDifference.toFixed(2)} [${v.primary.interval.map(n=>n.toFixed(2)).join(', ')}]`:'No qualified cases'} | ${v.disposition} |`);
  return `# Validated adaptation opportunities\n\n${p.question}\n\n${s.budget.auditEncounters} admission-table encounters and ${s.budget.learningEncounters} learning/control encounters; ${s.budget.total} new reserved executions. All candidates remain in the audit, including rejects.\n\n| Group | Qualified seeds | Primary damage gain [99.167% interval] | Decision |\n|---|---:|---:|---|\n${rows.join('\n')}\n\n${p.primary}\n\n${p.procedure}\n\n## Recovery and regret\n\n${p.recovery.definition}\n\n${p.regret}\n\nThe summary JSON contains each branch’s cumulative regret, initial displacement, censored recovery records, probability-integrated regret, clear/death rates and four-encounter curves. These secondary measures are exploratory.\n\n## Admission and scope\n\n${p.admission.selection}\n\n${p.admission.conditioning}\n\n${p.limits.map(x=>'- '+x).join('\n')}\n`;
}
