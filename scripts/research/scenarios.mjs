import assert from 'node:assert/strict';
import { ORIGINAL } from '../synthetic/scenarios.mjs';
import { playerConfig } from '../synthetic/players.mjs';
import { seedFor,randomAt } from '../synthetic/random.mjs';
import { validateWorld } from '../synthetic/geometry.mjs';
import { researchPlayerConfig } from './players.mjs';

export const TRAIN_FAMILIES=['circle','rush','cover','weave'];
export const TRAIN_MAPS=['practice-open','practice-dense'];
export const TEST_FAMILIES=['zigzag-advance','cover-peek'];
export const TEST_MAPS=['long-spines','courtyard'];
export const FRESH_CASES=TEST_FAMILIES.flatMap(f=>TEST_MAPS.map(m=>`${f}/${m}`));
const layouts={
  'practice-open':[{x:250,y:160,w:75,h:65},{x:600,y:380,w:75,h:65},{x:250,y:380,w:65,h:65},{x:600,y:160,w:65,h:65}],
  'practice-dense':[{x:230,y:130,w:140,h:90},{x:550,y:380,w:140,h:90},{x:230,y:380,w:90,h:90},{x:600,y:130,w:90,h:90}],
  'long-spines':[{x:260,y:120,w:45,h:180},{x:615,y:300,w:45,h:180}],
  courtyard:[{x:330,y:140,w:260,h:45},{x:330,y:415,w:260,h:45},{x:230,y:220,w:55,h:160},{x:635,y:220,w:55,h:160}],
};
export function worldFor(family,seed) {
  assert.ok(layouts[family]);const rejected=[];
  for(let attempt=0;attempt<32;attempt++) {
    const jitter=(stream,i)=>Math.round((randomAt(seed,`${attempt}/${stream}`,i)*2-1)*12),
      world={id:`${family}-${seed}`,family,seed,attempt,player:{...ORIGINAL.player},
        spawns:ORIGINAL.spawns.map((s,i)=>({x:s.x+jitter('spawn-x',i),y:s.y+jitter('spawn-y',i)})),
        walls:layouts[family].map((w,i)=>({...w,x:w.x+jitter('wall-x',i),y:w.y+jitter('wall-y',i)})),
        waypoints:[{x:140,y:300},{x:460,y:60},{x:780,y:300},{x:460,y:540}]};
    const validation=validateWorld(world);
    if(validation.valid)return {...world,validation,rejected};
    rejected.push({attempt,reasons:validation.errors});
  }
  throw Error(`Invalid world ${family}/${seed}: ${JSON.stringify(rejected)}`);
}
export function trainingExample(seed,index,{family,map,tag='training'}={}) {
  family??=TRAIN_FAMILIES[Math.floor(index/2)%4];map??=TRAIN_MAPS[index%2];
  assert.ok(TRAIN_FAMILIES.includes(family) && TRAIN_MAPS.includes(map));
  return {id:`${tag}/${index}/${family}/${map}`,phase:tag,phaseRound:index+1,
    world:worldFor(map,seedFor(seed,tag,'map',Math.floor(index/8),map)),
    player:playerConfig(family,seedFor(seed,tag,'player',index),Math.floor(index/8)%2?-1:1)};
}
export const trainingSchedule=(seed,count=48)=>Array.from({length:count},(_,i)=>trainingExample(seed,i));
export function history(seed,id,phase,count=12,direction=1) {
  if(['reverse','feint','cover','orbit'].includes(id))return Array.from({length:count},(_,i)=>({id:`${id}/${phase}/${i+1}`,phase,phaseRound:i+1,world:ORIGINAL,
    legacyStyle:phase==='repeat'||phase==='training'?'orbit':id}));
  assert.ok(FRESH_CASES.includes(id));const [family,map]=id.split('/'),
    world=worldFor(map,seedFor(seed,'reserved-map',map)),player=researchPlayerConfig(family,seedFor(seed,'reserved-player',family),direction);
  return Array.from({length:count},(_,i)=>({id:`${id}/${phase}/${i+1}`,phase,phaseRound:i+1,world,player}));
}
