import assert from 'node:assert/strict';
import { mean,pairedBootstrap } from '../evaluation-support.mjs';

export function summarizeRetention(p,trials) {
  const groups={};
  for(const suite of ['legacy','synthetic']) {
    const selected=trials.filter(t=>t.suite===suite);
    assert.deepEqual(selected.map(t=>t.seed),p[`${suite}_seeds`]);
    const cases=Object.keys(selected[0].branches),
      sets=suite==='legacy'?Object.fromEntries(cases.map(id=>[id,[id]])):
        {...Object.fromEntries(cases.map(id=>[id,[id]])),fresh:p.fresh_cases,known:cases.filter(id=>!p.fresh_cases.includes(id))};
    groups[suite]={};
    for(const [group,ids] of Object.entries(sets)) {
      groups[suite][group]={};
      for(const phase of suite==='legacy'?['switch']:['switch','return']) {
        const late=suite==='legacy'?p.legacy_late_rounds:p.late_rounds;
        const rows=(t,v,mode)=>ids.flatMap(id=>t.branches[id][v][phase][mode].slice(-late)),
          values=(v,mode)=>selected.map(t=>({seed:t.seed,value:mean(rows(t,v,mode).map(r=>r.damage))})),
          compare=(v,mode,w,other)=>pairedBootstrap(values(v,mode),values(w,other),p.uncertainty),
          metrics={},curves={};
        for(const v of p.variants) for(const mode of ['online','frozen']) {
          const all=selected.flatMap(t=>rows(t,v,mode));
          metrics[`${v}-${mode}`]={damage:mean(all.map(r=>r.damage)),playerClearRate:mean(all.map(r=>+(r.result==='cleared'))),
            playerDeathRate:mean(all.map(r=>+(r.result==='down'))),duration:mean(all.map(r=>r.duration))};
          const length=selected[0].branches[ids[0]][v][phase][mode].length;
          curves[`${v}-${mode}`]=Array.from({length:length/4},(_,i)=>({from:i*4+1,to:i*4+4,
            damage:mean(selected.flatMap(t=>ids.flatMap(id=>t.branches[id][v][phase][mode].slice(i*4,i*4+4).map(r=>r.damage))))}));
        }
        groups[suite][group][phase]={metrics,curves,candidateGain:compare('no-decay','online','original','online'),
          candidateLearning:compare('no-decay','online','no-decay','frozen'),originalLearning:compare('original','online','original','frozen')};
      }
    }
  }
  const practical=c=>c.meanDifference>=p.gates.minimum_gain && c.interval[0]>0,
    fresh=groups.synthetic.fresh.switch,feint=groups.legacy.feint.switch,
    gates={fresh_gain:practical(fresh.candidateGain),fresh_post_switch_learning:practical(fresh.candidateLearning),
      legacy_feint_gain:practical(feint.candidateGain),legacy_feint_learning_nonnegative:feint.candidateLearning.meanDifference>=0,
      no_large_case_regression:Object.entries(groups.synthetic).filter(([id])=>!['fresh','known'].includes(id)).every(([,phases])=>
        Object.values(phases).every(v=>v.candidateGain.meanDifference>=-p.gates.maximum_case_loss)) &&
        ['reverse','cover'].every(id=>groups.legacy[id].switch.candidateGain.meanDifference>=-p.gates.maximum_case_loss)};
  const budgets={};
  for(const t of trials)for(const v of p.variants) {
    const rows=[...t.training[v].rows];
    for(const variants of Object.values(t.branches))for(const [phase,b] of Object.entries(variants[v])) {
      if(phase==='repeat')rows.push(...b.rows);else rows.push(...b.online,...b.frozen);
    }
    const key=`${t.suite}/${v}`;budgets[key]??={encounters:0,steps:0};
    budgets[key].encounters+=rows.length;budgets[key].steps+=rows.reduce((s,r)=>s+r.steps,0);
  }
  const totalEncounters=Object.values(budgets).reduce((s,b)=>s+b.encounters,0);
  assert.equal(totalEncounters,p.expected_encounters);
  return {groups,gates,budgets,totalEncounters,disposition:Object.values(gates).every(Boolean)?'follow-up-candidate':'retain-original'};
}
export function retentionReport(p,s) {
  const fmt=c=>`${c.meanDifference.toFixed(2)} [${c.interval.map(v=>v.toFixed(2)).join(', ')}]`;
  return `# Automatic score-decay ablation — v1\n\nDecision: **${s.disposition}**. ${s.totalEncounters} measured encounters. Only automatic score decay changes, from 0.025 to 0; sampled actions still update. No production change.\n\n| Suite/case | Phase | No-decay − original | No-decay online − boundary frozen | Original online − boundary frozen |\n|---|---|---:|---:|---:|\n`+
    Object.entries(s.groups).flatMap(([suite,cases])=>Object.entries(cases).flatMap(([id,phases])=>Object.entries(phases).map(([phase,v])=>
      `| ${suite}/${id} | ${phase} | ${fmt(v.candidateGain)} | ${fmt(v.candidateLearning)} | ${fmt(v.originalLearning)} |`))).join('\n')+
    `\n\nValues are HP damage, late eight rounds for legacy and late four for synthetic. Brackets: 95% paired seed-bootstrap intervals. Primary: fresh switch aggregate; all other intervals exploratory.\n\n## Locked gates\n\n`+
    Object.entries(s.gates).map(([name,pass])=>`- ${name}: ${pass?'PASS':'FAIL'}`).join('\n')+
    `\n\n## Simulation budget\n\n| Suite/variant | Encounters | Steps |\n|---|---:|---:|\n`+Object.entries(s.budgets).map(([key,b])=>`| ${key} | ${b.encounters} | ${b.steps} |`).join('\n')+
    `\n\n${p.budget.interpretation}\n\n## Limits\n\n${p.limits.map(l=>'- '+l).join('\n')}\n\n## Reproduce\n\n\`npm run evaluate:retention -- --out target/retention-replication\`\n\n\`npm run verify:retention\` replays all combats and separately reconstructs all core feedback from physical evidence.\n`;
}
