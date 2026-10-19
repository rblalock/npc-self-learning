import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root,sha,checkHashes,writeNew,hashes } from './synthetic/io.mjs';
import { IDS } from './research/io.mjs';
import { createPolicy } from './research/policy.mjs';
import { encounter } from './research/combat.mjs';

const titles=['Individual adaptation','Team coordination','Situational memory','Returning strategies','Misleading histories','Training efficiency'];
const comparisons=[['Learning','Frozen at switch'],['Joint choices','Independent · same reward'],['Terrain memory','One shared memory'],['Retained memory','Reset memory'],['Baited memory','Reset memory'],['Selected training','Uniform training']];
const actionNames={rush:'Close distance',hold:'Hold lane',flank_left:'Flank left',flank_right:'Flank right',aim:'Aim at position',lead:'Lead movement'};
const args=process.argv.slice(2);assert.ok(args.length===0||(args.length===2&&args[0]==='--out'),'Use --out <new-prefix>');
const prefix=resolve(root,args[1]??'docs/experiments/research-program-v1-view'),
  audit=JSON.parse(await readFile(resolve(root,'docs/experiments/learning-opportunity-audit-v1.summary.json'))),studies=[];
let combatReplays=0;
for(const [i,id] of IDS.entries()) {
  const bytes=await readFile(resolve(root,`docs/experiments/${id}.results.json`)),r=JSON.parse(bytes),p=r.protocol,
    verification=JSON.parse(await readFile(resolve(root,`docs/experiments/${id}.verification.json`)));
  assert.equal(verification.resultSha256,sha(bytes));assert.equal(verification.matched,true);await checkHashes(r.provenance.sourceHashes);
  const t=r.trials.find(t=>t.seed===p.demonstration.seed),c=p.demonstration.case,kind=p.kind,demos=[];
  for(const role of kind==='individual'?['vanguard','flanker','ranger']:['team','curriculum'].includes(kind)?['squad']:['ranger']) {
    let entries,round=12;
    if(kind==='individual')entries=[['Learning',`${role}/${c}/online`],['Frozen at switch',`${role}/${c}/frozen`],['Random choices',`${role}/${c}/uniform`],['Best learned tactic',`${role}/${c}/greedy`]];
    if(kind==='team')entries=['original','shared','joint'].flatMap(v=>[['Learning', 'online'],['Frozen', 'frozen']].map(([label,m])=>[`${v==='original'?'Original':v==='shared'?'Shared reward':'Joint choices'} · ${label.toLowerCase()}`,`${v}/${c}/${m}`]));
    if(kind==='situational')entries=['pooled','terrain','shuffled'].flatMap(v=>[['Learning','online'],['Frozen','frozen']].map(([label,m])=>[`${v==='pooled'?'Pooled':v==='terrain'?'Terrain':'Shuffled'} · ${label.toLowerCase()}`,`${v}/${c}/${m}`]));
    if(kind==='return') {round=4;entries=[['Retained · learning',`${c}/retained/online`],['Retained · frozen',`${c}/retained/frozen`],['Reset memory',`${c}/reset`],['Saved A memory',`${c}/saved-a`]];}
    if(kind==='deception') {round=4;entries=[['Baited · learning',`${c}/baited/online`],['Baited · frozen',`${c}/baited/frozen`],['Matching history',`${c}/matched-online`],['Reset memory',`${c}/naive`]];}
    if(kind==='curriculum')entries=[['Uniform · 48 updates',`uniform48/${c}`],['Uniform · 24 updates + probes',`uniform24/${c}`],['Selected · 24 updates + probes',`adaptive24/${c}`]];
    const recordings={};
    for(const [label,key] of entries) {
      const b=t.blocks[key],policy=createPolicy(b.seed,b.spec);policy.request({op:'restore',snapshot:b.initial});
      try {
        for(let j=0;j<round;j++) {
          const capture=j===round-1,value=encounter(policy,b.spec,b.scenarios[j],{...b.options,capture}),row=capture?value.row:value;
          assert.deepEqual(row,b.rows[j]);combatReplays++;
          if(capture) {
            const before=j===0?b.initial.cells:b.rows[j-1].policy,
              decisions=row.choices.map((choice,k)=>{
                const matches=cell=>cell.role===choice.request.role&&cell.context===choice.request.context&&cell.action===choice.action;
                return {label:choice.request.role==='squad'?Object.values(row.actions).map(a=>actionNames[a]).join(' + '):actionNames[choice.action],
                  probability:choice.probabilities.find(p=>p.action===choice.action).probability,
                  before:before.find(matches).score,after:row.policy.find(matches).score,reward:row.feedback[k].reward,accepted:row.feedback[k].accepted};
              });
            recordings[key]={...value,label,decisions};
          }
        }
      } finally {policy.dispose();}
    }
    demos.push({role,round,scenario:t.blocks[entries[0][1]].scenarios[round-1],recordings});
  }
  studies.push({id,title:titles[i],question:p.question,seed:t.seed,case:c,primary:r.summary.primary,comparison:comparisons[i],
    curves:r.summary.groups.fresh[p.primary_key].curves,primaryWindow:['return','deception'].includes(kind)?'first 4':kind==='curriculum'?'all 12':'last 4',
    disposition:r.summary.disposition,encounters:r.summary.budget.encounters,selection:p.demonstration.selection,
    resultsSha256:sha(bytes),opportunity:audit.groups[id],headroom:audit.headroom[id],demos});
}
const payload={schema:1,studies,combatReplays,selection:'First seed and first reserved case for each locked protocol. All three isolated roles are included; no successful encounter was substituted.'};
await writeNew(prefix+'.json',payload);
const template=await readFile(resolve(root,'scripts/research-view.html'),'utf8'),html=template.replace('__PAYLOAD__',JSON.stringify(payload).replaceAll('<','\\u003c'));
await writeNew(prefix+'.html',html);
await writeNew(prefix+'.view.json',{htmlSha256:sha(html),payloadSha256:sha(JSON.stringify(payload)+'\n'),combatReplays,
  sources:await hashes(['scripts/replay-research.mjs','scripts/research-view.html']),resultHashes:Object.fromEntries(studies.map(s=>[s.id,s.resultsSha256]))});
console.log(JSON.stringify({html:prefix+'.html',combatReplays,recordings:studies.reduce((n,s)=>n+s.demos.reduce((m,d)=>m+Object.keys(d.recordings).length,0),0)}));
