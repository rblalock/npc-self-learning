import test from 'node:test';
import assert from 'node:assert/strict';
import { auditBlock,auditSummary } from './opportunity-audit.mjs';
import { verifyBlock } from './research/verify.mjs';
import { FRESH_CASES } from './research/scenarios.mjs';

test('forced-action audit is reproducible and uses original physical evidence',()=>{
  const args=['return-memory-v1',19,FRESH_CASES[0],'ranger',1,{ranger:'aim'}],a=auditBlock(...args);
  assert.deepEqual(a,auditBlock(...args));assert.equal(verifyBlock(a.block).decisions,1);
  assert.equal(a.block.rows[0].choices[0].action,'aim');assert.equal(a.block.rows[0].choices[0].baseline,true);
});
test('opportunity audit retains ties and detects direction-specific optima',()=>{
  const parent={protocol:{id:'return-memory-v1',kind:'return',seeds:[19],primary_key:'gain'},trials:[]},records=[];
  for(const [i,id] of FRESH_CASES.entries())for(const direction of [1,-1])for(const action of ['aim','lead']) {
    const damage=i===0?(direction===1?+(action==='aim')*12:+(action==='lead')*12):12;
    records.push({study:parent.protocol.id,seed:19,case:id,role:'ranger',direction,actions:{ranger:action},block:{rows:[{damage}]}});
  }
  // Supply one minimal comparator; no physical rows are claimed for this analysis-only test.
  const r={damage:0},scenario={player:{family:'qa',direction:1},world:{family:'qa'}};
  parent.trials=[{seed:19,blocks:{control:{spec:{roster:['ranger']},rows:[r],scenarios:[scenario]}},comparisons:[{key:'gain',group:'fresh',case:FRESH_CASES[0],right:'control',window:'early',rounds:1}]}];
  const s=auditSummary(records,[parent]),g=s.groups[parent.protocol.id].ranger;
  assert.equal(g.disjointOptimaFraction,.25);assert.equal(g.noDamageChoiceFraction,.75);assert.equal(g.changedOptimaFraction,.25);
});
