import assert from 'node:assert/strict';
import { mean,pairedBootstrap } from '../evaluation-support.mjs';

export function selectedRows(t,c,side) {
  const rows=t.blocks[c[side]].rows;
  return c.window==='early'?rows.slice(0,c.rounds):rows.slice(-c.rounds);
}
export function summarize(p,trials) {
  assert.deepEqual(trials.map(t=>t.seed),p.seeds);
  const first=trials[0].comparisons,groups={},keys=[...new Set(first.map(c=>c.key))],
    scopes=[...new Set(first.map(c=>c.group)),...new Set(first.map(c=>c.case)),
      ...(p.kind==='individual'?['vanguard','flanker','ranger']:[])];
  for(const scope of scopes) {
    groups[scope]={};
    for(const key of keys) {
      const filter=c=>c.key===key&&(c.group===scope||c.case===scope||(c.role===scope&&c.group==='fresh'));
      if(!first.some(filter))continue;
      const values=side=>trials.map(t=>({seed:t.seed,value:mean(t.comparisons.filter(filter).map(c=>mean(selectedRows(t,c,side).map(r=>r.damage))))})),
        primary=scope==='fresh'&&key===p.primary_key,
        effect=pairedBootstrap(values('left'),values('right'),primary?p.primary_uncertainty:p.secondary_uncertainty),
        metric=side=>{
          const rows=trials.flatMap(t=>t.comparisons.filter(filter).flatMap(c=>selectedRows(t,c,side)));
          return {damage:mean(rows.map(r=>r.damage)),playerClearRate:mean(rows.map(r=>+(r.result==='cleared'))),
            playerDeathRate:mean(rows.map(r=>+(r.result==='down'))),duration:mean(rows.map(r=>r.duration))};
        };
      // Curves keep the whole branch visible; four encounters per block.
      const n=trials[0].blocks[first.find(filter).left].rows.length;
      const curves=Array.from({length:n/4},(_,i)=>{
        const phase=side=>trials.map(t=>({seed:t.seed,value:mean(t.comparisons.filter(filter).map(c=>
          mean(t.blocks[c[side]].rows.slice(i*4,i*4+4).map(r=>r.damage))))}));
        return {from:i*4+1,to:i*4+4,left:mean(phase('left').map(r=>r.value)),right:mean(phase('right').map(r=>r.value)),
          effect:pairedBootstrap(phase('left'),phase('right'),p.secondary_uncertainty)};
      });
      groups[scope][key]={effect,left:metric('left'),right:metric('right'),curves,primary};
    }
  }
  const primary=groups.fresh[p.primary_key].effect,
    cases=p.fresh_cases.map(id=>({case:id,effect:groups[id][p.primary_key].effect})),
    gates=p.kind==='deception'?{
      mean_within_margin:primary.meanDifference>=-3,adjusted_interval_within_margin:primary.interval[0]>-3,
    }:{
      meaningful_primary:primary.meanDifference>=p.minimum_gain,
      adjusted_interval_positive:primary.interval[0]>0,
      no_large_fresh_case_regression:cases.every(c=>c.effect.meanDifference>=-p.maximum_case_loss),
    };
  if(p.kind==='team') {
    gates.not_worse_than_original=groups.fresh['joint-minus-original'].effect.meanDifference>=0;
    const learning=groups.fresh['joint-learning'].effect;
    gates.joint_continued_learning=learning.meanDifference>=3&&learning.interval[0]>0;
  }
  if(p.kind==='situational') {
    const sham=groups.fresh['terrain-minus-shuffled'].effect;
    gates.beats_shuffled_context=sham.meanDifference>=3&&sham.interval[0]>0;
  }
  if(p.kind==='curriculum')gates.not_worse_at_matched_update_count=groups.fresh['adaptive-minus-uniform24'].effect.meanDifference>=0;
  const budget={encounters:0,decisions:0,steps:0,byArm:{},byPhase:{}};
  for(const t of trials)for(const [id,b] of Object.entries(t.blocks)) {
    const arm=['individual','team','situational','curriculum'].includes(p.kind)?id.split('/')[0]:'all-history-and-controls';
    budget.byArm[arm]??={encounters:0,steps:0,decisions:0};
    for(const [i,r] of b.rows.entries()) {
      budget.encounters++;budget.steps+=r.steps;budget.decisions+=r.choices.length;
      budget.byArm[arm].encounters++;budget.byArm[arm].steps+=r.steps;budget.byArm[arm].decisions+=r.choices.length;
      const phase=b.scenarios[i].phase;budget.byPhase[phase]=(budget.byPhase[phase]??0)+1;
    }
  }
  assert.equal(budget.encounters,p.expected_encounters);
  return {primary,groups,gates,budget,disposition:Object.values(gates).every(Boolean)?
    (p.kind==='deception'?'scripted-stress-margin-met':'local-screen-supported'):'not-supported-by-this-screen'};
}
export const fmt=c=>`${c.meanDifference.toFixed(2)} [${c.interval.map(v=>v.toFixed(2)).join(', ')}]`;
export function report(p,s) {
  return `# ${p.id}\n\n${p.question}\n\nDecision: **${s.disposition}**. No production change.\n\nPrimary: **${fmt(s.primary)} HP**, nominal 99.167% paired seed-bootstrap interval. ${p.primary_endpoint}\n\n${p.procedure}\n\n## Gates\n\n${Object.entries(s.gates).map(([k,v])=>'- '+k+': '+(v?'PASS':'FAIL')).join('\n')}\n\n## Results\n\n| Scope | Comparison | Mean damage difference [interval] |\n|---|---|---:|\n`+
    Object.entries(s.groups).flatMap(([scope,keys])=>Object.entries(keys).map(([key,v])=>`| ${scope} | ${key} | ${fmt(v.effect)}${v.primary?' (99.167%)':' (95%)'} |`)).join('\n')+
    `\n\nFull four-fight curves, individual seed pairs, clear/death rates and duration are in the summary JSON. These measures concern enemy effectiveness.\n\n## Budget\n\n${s.budget.encounters} scored encounters; ${s.budget.steps} simulation steps; ${s.budget.decisions} real core choices.\n\n| Arm | Encounters | Steps | Core choices |\n|---|---:|---:|---:|\n`+
    Object.entries(s.budget.byArm).map(([k,v])=>`| ${k} | ${v.encounters} | ${v.steps} | ${v.decisions} |`).join('\n')+
    `\n\n${p.budget}\n\n## Scope\n\n${p.uncertainty_scope}\n\n${p.reward??''}\n\n${p.exploration??''}\n\n${p.limits.map(l=>'- '+l).join('\n')}\n`;
}
