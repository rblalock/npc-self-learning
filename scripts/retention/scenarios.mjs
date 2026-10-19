import assert from 'node:assert/strict';
import { seedFor,randomAt } from '../synthetic/random.mjs';
import { validateWorld } from '../synthetic/geometry.mjs';
import { ORIGINAL,trainingSchedule,testSchedule } from '../synthetic/scenarios.mjs';
import { freshPlayerConfig,FRESH_FAMILIES } from './players.mjs';
export { trainingSchedule };
export const FRESH_MAPS=['split-gates','shelves'];
const layouts={
  'split-gates':[{x:300,y:90,w:45,h:130},{x:300,y:380,w:45,h:130},{x:575,y:90,w:45,h:130},{x:575,y:380,w:45,h:130}],
  shelves:[{x:190,y:210,w:180,h:40},{x:550,y:350,w:180,h:40},{x:400,y:100,w:120,h:40},{x:400,y:460,w:120,h:40}],
};
export function freshWorld(family,seed) {
  assert.ok(FRESH_MAPS.includes(family));const rejected=[];
  for(let attempt=0;attempt<32;attempt++) {
    const jitter=(stream,i)=>Math.round((randomAt(seed,`${attempt}/${stream}`,i)*2-1)*12);
    const world={id:`${family}-${seed}`,family,seed,attempt,player:{...ORIGINAL.player},
      spawns:ORIGINAL.spawns.map((s,i)=>({x:s.x+jitter('spawn-x',i),y:s.y+jitter('spawn-y',i)})),
      walls:layouts[family].map((w,i)=>({...w,x:w.x+jitter('wall-x',i),y:w.y+jitter('wall-y',i)})),
      waypoints:[{x:140,y:300},{x:460,y:60},{x:780,y:300},{x:460,y:540}]};
    const validation=validateWorld(world);
    if(validation.valid)return {...world,validation,rejected};
    rejected.push({attempt,reasons:validation.errors});
  }
  throw Error(`Invalid fresh world ${family}/${seed}: ${JSON.stringify(rejected)}`);
}
export function syntheticSchedules(p,seed) {
  const schedules={};
  for(const f of ['bait-switch','reactive'])for(const m of ['staggered-lanes','offset-islands'])
    schedules[`${f}/${m}`]=testSchedule(p,seed,f,m);
  for(const f of FRESH_FAMILIES)for(const m of FRESH_MAPS) {
    const world=freshWorld(m,seedFor(seed,'retention-reserved-map',m)),botSeed=seedFor(seed,'retention-reserved-player',f);
    schedules[`${f}/${m}`]=['repeat','switch','return'].flatMap((phase,phaseIndex)=>
      Array.from({length:p.phase_rounds},(_,i)=>({id:`${f}/${m}/${phase}/${i+1}`,phase,phaseIndex,phaseRound:i+1,world,
        player:freshPlayerConfig(f,botSeed,phase==='switch'?-1:1)})));
  }
  return schedules;
}
export function legacySchedule(style,rounds,phase) {
  return Array.from({length:rounds},(_,i)=>({id:`legacy/${style}/${phase}/${i+1}`,phase,phaseRound:i+1,world:ORIGINAL,legacyStyle:style}));
}
