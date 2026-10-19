import assert from 'node:assert/strict';
import { seedFor } from '../synthetic/random.mjs';
import { block } from './combat.mjs';
import { specification,ROLES,createPolicy,alignedMemory } from './policy.mjs';
import { trainingSchedule,trainingExample,history,FRESH_CASES,TRAIN_FAMILIES,TRAIN_MAPS } from './scenarios.mjs';

const physical = r => ({damage:r.damage,health:r.health,result:r.result,duration:r.duration,enemies:r.enemies,actions:r.actions,inputSha256:r.inputSha256,inputs:r.inputs,steps:r.steps,choices:r.choices});
export function runTrial(p,seed) {
  const blocks={},comparisons=[],interventions=[],selections=[];
  const run=(id,spec,scenarios,{from,policySeed=seed,...options}={})=>{
    assert.ok(!blocks[id],`Duplicate block ${id}`);
    const b=block(policySeed,spec,scenarios,{...options,snapshot:from?.snapshot??options.snapshot});
    b.parent=from?Object.keys(blocks).find(key=>blocks[key]===from):null;
    b.initialKind=from?'continuation':options.snapshot?'intervention':'fresh';
    blocks[id]=b;return b;
  };
  const pair=(id,spec,scenarios,from,policySeed=seed)=>{
    const online=run(id+'/online',spec,scenarios,{from,policySeed}),frozen=run(id+'/frozen',spec,scenarios,{from,policySeed,learning:false});
    assert.deepEqual(physical(online.rows[0]),physical(frozen.rows[0]),'Exact branch boundary mismatch');
    return {online,frozen};
  };
  const compare=(key,caseId,left,right,{window='late',rounds=4,group='fresh',role='squad'}={})=>
    comparisons.push({key,case:caseId,left,right,window,rounds,group,role});

  if(p.kind==='individual') {
    for(const role of ROLES) {
      const spec=specification({roster:[role]}),policySeed=seedFor(seed,role),train=run(`${role}/train`,spec,trainingSchedule(seed),{policySeed});
      for(const id of ['reverse','feint','cover',...FRESH_CASES]) {
        const base=`${role}/${id}`,repeat=run(base+'/repeat',spec,history(seed,id,'repeat'),{from:train,policySeed}),
          switched=history(seed,id,'switch',12,-1);
        pair(base,spec,switched,repeat,policySeed);
        run(base+'/uniform',spec,switched,{from:repeat,policySeed,baseline:true,learning:false});
        const best=[...repeat.snapshot.cells].sort((a,b)=>b.score-a.score||a.action.localeCompare(b.action))[0].action;
        selections.push({kind:'greedy-at-switch',block:base+'/greedy',source:base+'/repeat',forced:{[role]:best}});
        run(base+'/greedy',spec,switched,{from:repeat,policySeed,baseline:true,learning:false,forced:{[role]:best}});
        const group=FRESH_CASES.includes(id)?'fresh':'known';
        for(const mode of ['frozen','uniform','greedy'])compare(`online-minus-${mode}`,id,base+'/online',base+'/'+mode,{group,role});
      }
    }
  }
  if(p.kind==='team') {
    const variants={original:specification(),shared:specification({reward:'shared'}),joint:specification({reward:'shared',architecture:'joint'})};
    for(const [variant,spec] of Object.entries(variants))for(const group of ['known','fresh']) {
      const train=run(`${variant}/${group}/train`,spec,group==='known'?history(seed,'orbit','training',24):trainingSchedule(seed));
      for(const id of group==='known'?['reverse','feint','cover']:FRESH_CASES) {
        const base=`${variant}/${id}`,from=group==='known'?train:run(base+'/repeat',spec,history(seed,id,'repeat'),{from:train});
        pair(base,spec,history(seed,id,'switch',group==='known'?24:12,-1),from);
        compare(`${variant}-learning`,id,base+'/online',base+'/frozen',{group,rounds:group==='known'?8:4});
      }
    }
    for(const id of ['reverse','feint','cover',...FRESH_CASES]) {
      const options={group:FRESH_CASES.includes(id)?'fresh':'known',rounds:FRESH_CASES.includes(id)?4:8};
      compare('joint-minus-shared',id,`joint/${id}/online`,`shared/${id}/online`,options);
      compare('joint-minus-original',id,`joint/${id}/online`,`original/${id}/online`,options);
      compare('shared-minus-original',id,`shared/${id}/online`,`original/${id}/online`,options);
    }
  }
  if(p.kind==='situational') {
    for(const context of ['pooled','terrain','shuffled']) {
      const spec=specification({roster:['ranger'],context}),train=run(`${context}/train`,spec,trainingSchedule(seed));
      for(const id of FRESH_CASES) {
        const base=`${context}/${id}`,repeat=run(base+'/repeat',spec,history(seed,id,'repeat'),{from:train});
        pair(base,spec,history(seed,id,'switch',12,-1),repeat);
        compare(context+'-learning',id,base+'/online',base+'/frozen',{role:'ranger'});
      }
    }
    for(const id of FRESH_CASES)for(const mode of ['pooled','shuffled'])
      compare('terrain-minus-'+mode,id,`terrain/${id}/online`,`${mode}/${id}/online`,{role:'ranger'});
  }
  if(p.kind==='return') {
    const spec=specification({roster:['ranger']});
    for(const id of FRESH_CASES) {
      const a=run(id+'/a',spec,history(seed,id,'first-a',24,1)),b=run(id+'/b',spec,history(seed,id,'b',24,-1),{from:a}),
        returning=history(seed,id,'return-a',24,1);
      pair(id+'/retained',spec,returning,b);
      const fresh=createPolicy(seed,spec),empty=fresh.request({op:'snapshot'});fresh.dispose();
      for(const [mode,cells,source] of [['reset','empty',empty],['saved-a',id+'/a',a.snapshot]]) {
        const snapshot=alignedMemory(b.snapshot,source),key=id+'/'+mode;
        interventions.push({block:key,current:id+'/b',cells,snapshot});
        run(key,spec,returning,{snapshot});
      }
      compare('retained-minus-reset',id,id+'/retained/online',id+'/reset',{window:'early',role:'ranger'});
      compare('retained-minus-saved-a',id,id+'/retained/online',id+'/saved-a',{window:'early',role:'ranger'});
      compare('return-learning',id,id+'/retained/online',id+'/retained/frozen',{rounds:8,role:'ranger'});
      compare('late-retained-minus-reset',id,id+'/retained/online',id+'/reset',{rounds:8,role:'ranger'});
    }
  }
  if(p.kind==='deception') {
    const spec=specification({roster:['ranger']});
    for(const id of FRESH_CASES) {
      const bait=run(id+'/bait',spec,history(seed,id,'bait',24,1)),matched=run(id+'/matched',spec,history(seed,id,'matched',24,-1)),attack=history(seed,id,'attack',24,-1);
      pair(id+'/baited',spec,attack,bait);
      run(id+'/matched-online',spec,attack,{from:matched});
      const fresh=createPolicy(seed,spec),empty=fresh.request({op:'snapshot'});fresh.dispose();
      const reset=alignedMemory(bait.snapshot,empty);
      interventions.push({block:id+'/naive',current:id+'/bait',cells:'empty',snapshot:reset});
      run(id+'/naive',spec,attack,{snapshot:reset});
      compare('baited-minus-naive',id,id+'/baited/online',id+'/naive',{window:'early',role:'ranger'});
      compare('baited-minus-matched',id,id+'/baited/online',id+'/matched-online',{window:'early',role:'ranger'});
      compare('recovery-learning',id,id+'/baited/online',id+'/baited/frozen',{rounds:8,role:'ranger'});
      compare('late-baited-minus-naive',id,id+'/baited/online',id+'/naive',{rounds:8,role:'ranger'});
    }
  }
  if(p.kind==='curriculum') {
    const spec=specification();
    for(const variant of ['uniform48','uniform24','adaptive24']) {
      let trained;
      if(variant==='uniform48')trained=run(variant+'/train',spec,trainingSchedule(seed));
      else for(let cycle=0;cycle<8;cycle++) {
        const candidates=Array.from({length:3},(_,j)=>{
          const index=(cycle*3+j)%8,family=TRAIN_FAMILIES[Math.floor(index/2)],map=TRAIN_MAPS[index%2],
            scenario=trainingExample(seed,cycle*3+j,{family,map,tag:'probe'}),id=`${variant}/probe/${cycle}/${j}`,
            probe=run(id,spec,[scenario],{from:trained,learning:false});
          return {id,family,map,damage:probe.rows[0].damage};
        });
        const selected=[...candidates].sort((a,b)=>a.damage-b.damage||a.id.localeCompare(b.id))[0];
        const schedule=Array.from({length:3},(_,j)=>trainingExample(seed,cycle*3+j,
          variant==='adaptive24'?{family:selected.family,map:selected.map,tag:'selected-training'}:{}));
        selections.push({kind:'curriculum',variant,cycle,candidates,selected:variant==='adaptive24'?selected:null,trainingBlock:`${variant}/train/${cycle}`});
        trained=run(`${variant}/train/${cycle}`,spec,schedule,{from:trained});
      }
      for(const id of FRESH_CASES)run(`${variant}/${id}`,spec,[...history(seed,id,'test-forward',6,1),...history(seed,id,'test-reverse',6,-1)],{from:trained,learning:false});
    }
    for(const id of FRESH_CASES)for(const reference of ['uniform48','uniform24'])
      compare('adaptive-minus-'+reference,id,`adaptive24/${id}`,`${reference}/${id}`,{rounds:12});
  }
  return {seed,blocks,comparisons,interventions,selections};
}
