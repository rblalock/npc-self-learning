import assert from 'node:assert/strict';
import { block } from '../research/combat.mjs';
import { createPolicy,specification,alignedMemory } from '../research/policy.mjs';
import { seedFor } from '../synthetic/random.mjs';
import { specOf } from './fixtures.mjs';

export const schedule=(f,pattern,count,phase)=>Array.from({length:count},(_,i)=>{
  const side=pattern[i%pattern.length],s=f.scenarios[side];
  return {...s,id:`${f.group}/${f.seed}/${f.index}/${phase}/${i+1}`,phase,phaseRound:i+1};
});
export function trial(f,p) {
  const seed=seedFor(f.seed,f.group,'learner'),n=p.phase_rounds,blocks={},interventions=[],context=f.group.startsWith('context-');
  function run(id,spec,scenarios,{from,...options}={}) {
    assert.ok(!blocks[id]);const b=block(seed,spec,scenarios,{...options,snapshot:from?blocks[from].snapshot:options.snapshot});
    b.parent=from??null;b.initialKind=from?'continuation':options.snapshot?'intervention':'fresh';blocks[id]=b;return b;
  }
  function reset(id,from,spec,scenarios) {
    const policy=createPolicy(seed,spec),empty=policy.request({op:'snapshot'});policy.dispose();
    const snapshot=alignedMemory(blocks[from].snapshot,empty);
    interventions.push({block:id,current:from,cells:'empty',snapshot});return run(id,spec,scenarios,{snapshot});
  }
  if(context) {
    for(const mode of ['pooled','terrain','shuffled']) {
      const spec=specOf(f.group,mode);
      run(`${mode}/train`,spec,schedule(f,[0,1],n,'context-training'));
      run(`${mode}/test`,spec,schedule(f,[1,0],n,'context-test'),{from:`${mode}/train`,learning:false});
    }
  } else {
    const spec=f.group==='squad'?specification({architecture:'joint',reward:'shared'}):specOf(f.group),
      switchScenarios=schedule(f,[1],n,'switch'),returnScenarios=schedule(f,[0],n,'return'),sameScenarios=schedule(f,[0],n,'sham-switch');
    run('train',spec,schedule(f,[0],n,'train-A'));
    run('switch/online',spec,switchScenarios,{from:'train'});
    run('switch/frozen',spec,switchScenarios,{from:'train',learning:false});
    run('switch/uniform',spec,switchScenarios,{from:'train',learning:false,baseline:true});
    reset('switch/reset','train',spec,switchScenarios);
    run('return/online',spec,returnScenarios,{from:'switch/online'});
    run('return/frozen',spec,returnScenarios,{from:'switch/online',learning:false});
    reset('return/reset','switch/online',spec,returnScenarios);
    run('sham/online',spec,sameScenarios,{from:'train'});
    run('sham/frozen',spec,sameScenarios,{from:'train',learning:false});
    if(f.group==='squad') {
      const independent=specOf('squad');
      run('independent/train',independent,schedule(f,[0],n,'train-A'));
      run('independent/online',independent,switchScenarios,{from:'independent/train'});
      run('independent/frozen',independent,switchScenarios,{from:'independent/train',learning:false});
    }
    for(const phase of ['switch','return','sham']) {
      const online=blocks[`${phase}/online`],frozen=blocks[`${phase}/frozen`];
      for(const k of ['choices','damage','inputSha256'])assert.deepEqual(online.rows[0][k],frozen.rows[0][k]);
    }
  }
  return {seed:f.seed,group:f.group,index:f.index,blocks,interventions,selections:[]};
}
