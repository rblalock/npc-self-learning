import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mean } from './evaluation-support.mjs';
import { TACTICS } from './evidence-baseline.mjs';
import { root,sha,readProtocol,outputPrefix,hashes,checkHashes,writeNew } from './synthetic/io.mjs';
import { RESEARCH_SOURCES } from './research/io.mjs';
import { specification,ROLES,PROFILES } from './research/policy.mjs';
import { block } from './research/combat.mjs';
import { verifyBlock } from './research/verify.mjs';
import { history,FRESH_CASES } from './research/scenarios.mjs';
import { seedFor } from './synthetic/random.mjs';
import { selectedRows } from './research/analysis.mjs';

const actionKey=actions=>JSON.stringify(Object.fromEntries(Object.entries(actions).sort(([a],[b])=>a.localeCompare(b))));
const key=(study,seed,id,role,direction,actions)=>JSON.stringify([study,seed,id,role,direction,actionKey(actions)]);
const physical=r=>Object.fromEntries(['damage','health','result','duration','steps','enemies','inputSha256','inputs'].map(k=>[k,r[k]]));
export function auditBlock(study,seed,id,role,direction,actions) {
  const roster=role==='squad'?ROLES:[role],spec=specification({roster}),
    policySeed=study==='individual-adaptation-v1'?seedFor(seed,role):seed,
    b=block(policySeed,spec,history(seed,id,direction===1?'audit-forward':'audit-reverse',1,direction),{baseline:true,learning:false,forced:actions});
  return {study,seed,case:id,role,direction,actions,block:b};
}
export function auditSummary(records,parents) {
  const lookup=new Map(records.map(r=>[key(r.study,r.seed,r.case,r.role,r.direction,r.actions),r]));
  assert.equal(lookup.size,records.length);
  const groups={},headroom={};let matchedMainCombats=0;
  for(const parent of parents) {
    const id=parent.protocol.id,roles=parent.protocol.kind==='individual'?ROLES:['team','curriculum'].includes(parent.protocol.kind)?['squad']:['ranger'];
    groups[id]={};
    for(const role of roles) {
      const pairs=[];
      for(const seed of parent.protocol.seeds)for(const c of FRESH_CASES) {
        const dirs=[1,-1].map(direction=>{
          const rs=records.filter(r=>r.study===id&&r.seed===seed&&r.case===c&&r.role===role&&r.direction===direction),
            values=rs.map(r=>r.block.rows[0].damage),best=Math.max(...values),worst=Math.min(...values),
            optimal=rs.filter(r=>r.block.rows[0].damage===best).map(r=>actionKey(r.actions)).sort();
          assert.equal(rs.length,role==='squad'?8:2);
          return {direction,best,worst,range:best-worst,optimal};
        });
        pairs.push({seed,case:c,directions:dirs,disjoint:!dirs[0].optimal.some(a=>dirs[1].optimal.includes(a)),
          changed:JSON.stringify(dirs[0].optimal)!==JSON.stringify(dirs[1].optimal)});
      }
      groups[id][role]={directionPairs:pairs.length,meanRange:mean(pairs.flatMap(p=>p.directions.map(d=>d.range))),
        noDamageChoiceFraction:mean(pairs.flatMap(p=>p.directions.map(d=>+(d.range===0)))),
        disjointOptimaFraction:mean(pairs.map(p=>+p.disjoint)),changedOptimaFraction:mean(pairs.map(p=>+p.changed)),pairs};
    }
    const differences=[];
    for(const t of parent.trials) {
      // Every fresh main fight must agree with the corresponding action-table counterfactual.
      for(const b of Object.values(t.blocks))for(const [i,r] of b.rows.entries()) {
        const s=b.scenarios[i],caseId=s.player?`${s.player.family}/${s.world.family}`:null;
        if(!FRESH_CASES.includes(caseId))continue;
        const role=b.spec.roster.length===3?'squad':b.spec.roster[0],entry=lookup.get(key(id,t.seed,caseId,role,s.player.direction,r.actions));
        assert.ok(entry);assert.deepEqual(physical(r),physical(entry.block.rows[0]));matchedMainCombats++;
      }
      const comparisons=t.comparisons.filter(c=>c.key===parent.protocol.primary_key&&c.group==='fresh'),values=[];
      for(const c of comparisons) {
        const b=t.blocks[c.right],rows=selectedRows(t,c,'right');
        for(const row of rows) {
          const s=b.scenarios[b.rows.indexOf(row)],role=b.spec.roster.length===3?'squad':b.spec.roster[0],
            best=groups[id][role].pairs.find(p=>p.seed===t.seed&&p.case===c.case).directions.find(d=>d.direction===s.player.direction).best;
          values.push(best-row.damage);
        }
      }
      differences.push({seed:t.seed,headroom:mean(values)});
    }
    headroom[id]={meanOracleHeadroom:mean(differences.map(v=>v.headroom)),pairs:differences,
      interpretation:'Offline per-world best action minus the main primary comparator; optimistic ceiling, not learned performance.'};
  }
  return {groups,headroom,matchedMainCombats,scoredEncounters:records.length};
}
function markdown(p,s) {
  return `# Learning opportunity audit\n\nSeparately specified diagnostic on the six completed screens. No main protocol or learner was changed. ${s.scoredEncounters} new fixed-action fights.\n\n| Study | Enemy | Action-sensitive fights | Direction changes requiring a different optimum | Mean best–worst range |\n|---|---|---:|---:|---:|\n`+
    Object.entries(s.groups).flatMap(([id,roles])=>Object.entries(roles).map(([role,v])=>`| ${id} | ${role} | ${((1-v.noDamageChoiceFraction)*100).toFixed(1)}% | ${(v.disjointOptimaFraction*100).toFixed(1)}% | ${v.meanRange.toFixed(2)} HP |`)).join('\n')+
    `\n\nA different optimum is required only when the best-action sets for the two directions do not overlap. Ties are retained.\n\n| Main comparison | Optimistic mean headroom over its comparator |\n|---|---:|\n`+
    Object.entries(s.headroom).map(([id,v])=>`| ${id} | ${v.meanOracleHeadroom.toFixed(2)} HP |`).join('\n')+
    `\n\n${s.matchedMainCombats} fresh main-study combats agree exactly with their corresponding table entry, including physical outcomes and synthetic input fingerprints. These matches validate the counterfactual lookup; they do not create new independent observations.\n\n${p.limits.map(l=>'- '+l).join('\n')}\n`;
}

// Keep imports usable by tests without starting a measurement.
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const {protocol:p,path,hash}=await readProtocol('learning-opportunity-audit-v1'),prefix=await outputPrefix(p.id),
    sourceHashes=await hashes([...RESEARCH_SOURCES,path,'scripts/opportunity-audit.mjs','scripts/opportunity-audit.test.mjs',...p.studies.map(id=>`docs/experiments/${id}.results.json`)]),
    parents=[];
  for(const id of p.studies) {
    const parent=JSON.parse(await readFile(resolve(root,`docs/experiments/${id}.results.json`)));
    await checkHashes(parent.provenance.sourceHashes);parents.push(parent);
  }
  await writeNew(prefix+'.started.json',{startedAt:new Date().toISOString(),protocolSha256:hash,sourceHashes});
  const records=[];
  for(const parent of parents) {
    const study=parent.protocol.id,roles=parent.protocol.kind==='individual'?ROLES:['team','curriculum'].includes(parent.protocol.kind)?['squad']:['ranger'];
    for(const seed of parent.protocol.seeds)for(const id of FRESH_CASES)for(const role of roles)for(const direction of [1,-1]) {
      const profiles=role==='squad'?PROFILES.map(p=>p.actions):TACTICS[role].map(a=>({[role]:a}));
      for(const actions of profiles)records.push(auditBlock(study,seed,id,role,direction,actions));
    }
    console.error(`Enumerated ${study}`);
  }
  assert.equal(records.length,p.expected_encounters);
  const summary=auditSummary(records,parents);await checkHashes(sourceHashes);
  const result={schema:1,protocol:p,provenance:{sourceHashes,protocolSha256:hash,completedAt:new Date().toISOString()},records,summary};
  await writeNew(prefix+'.results.json',result);await writeNew(prefix+'.summary.json',JSON.stringify(summary,null,2)+'\n');await writeNew(prefix+'.md',markdown(p,summary));
  let choices=0;
  for(const r of records) {
    choices+=verifyBlock(r.block).decisions;
    assert.deepEqual(auditBlock(r.study,r.seed,r.case,r.role,r.direction,r.actions),r);
  }
  await writeNew(prefix+'.verification.json',{verifiedAt:new Date().toISOString(),resultSha256:sha(await readFile(prefix+'.results.json')),fullCombatReplays:records.length,
    independentPolicyDecisions:choices,matchedMainCombats:summary.matchedMainCombats,matched:true});
  console.log(JSON.stringify({scored:records.length,matchedMainCombats:summary.matchedMainCombats,headroom:summary.headroom},null,2));
}
