import assert from 'node:assert/strict';
import { seedFor,randomAt } from '../synthetic/random.mjs';
import { playerConfig } from '../synthetic/players.mjs';
import { validateWorld } from '../synthetic/geometry.mjs';
import { TACTICS } from '../evidence-baseline.mjs';
import { ROLES,PROFILES,specification } from '../research/policy.mjs';
import { block } from '../research/combat.mjs';

export const GROUPS=['solo-vanguard','solo-flanker','solo-ranger','squad','context-flanker','context-ranger'];
const sparse=[{x:310,y:85,w:35,h:120},{x:575,y:395,w:35,h:120}],
 dense=[{x:260,y:90,w:120,h:90},{x:540,y:90,w:120,h:90},{x:260,y:420,w:120,h:90},{x:540,y:420,w:120,h:90}];
export const roleOf=group=>group==='squad'?'squad':group.split('-')[1];
export const specOf=(group,context='pooled')=>specification({roster:group==='squad'?ROLES:[roleOf(group)],context,reward:group==='squad'?'shared':'individual'});
export const profilesOf=group=>group==='squad'?PROFILES.map(p=>p.actions):TACTICS[roleOf(group)].map(a=>({[roleOf(group)]:a}));
export const actionKey=actions=>JSON.stringify(Object.fromEntries(Object.entries(actions).sort(([a],[b])=>a.localeCompare(b))));

export function fixture(group,seed,index) {
  assert.ok(GROUPS.includes(group));assert.ok(Number.isInteger(index)&&index>=0&&index<32);
  const context=group.startsWith('context-'),role=roleOf(group),worldSeed=seedFor(seed,group,index,'world');
  function world(density) {
    const jitter=(k,i)=>Math.round((randomAt(worldSeed,k,i)*2-1)*18),
      w={id:`opportunity-${seed}-${index}-${density}`,family:`offset-${density}`,seed:worldSeed,
        player:{x:460+jitter('player-x',0),y:300+jitter('player-y',0)},
        spawns:[{x:105,y:300},{x:815,y:475},{x:790,y:105}].map((s,i)=>({x:s.x+jitter('spawn-x',i),y:s.y+jitter('spawn-y',i)})),
        walls:(density==='sparse'?sparse:dense).map((w,i)=>({...w,x:w.x+jitter('wall-x',i),y:w.y+jitter('wall-y',i)})),
        waypoints:[{x:140,y:100},{x:460,y:60},{x:780,y:300},{x:460,y:540}]};
    w.validation=validateWorld(w);return w;
  }
  const base={...playerConfig('circle',seedFor(seed,group,index,'player')),
    speed:.55+.12*(index%4),fireInterval:1.2+.35*(Math.floor(index/4)%4),
    turnPeriod:.55+.35*Math.floor(index/16),aimError:.12,hesitation:.025},
    density=index%2?'dense':'sparse',a={...base},b={...base};
  if(!context) {
    if(role==='vanguard'){a.family='rush';b.family='circle';}
    else if(role==='ranger'){a.family='circle';b.family=index<16?'bait-switch':'weave';}
    else {a.family='circle';b.family='circle';b.direction=-1;}
  } else {a.direction=b.direction=index%2?1:-1;}
  const scenarios=[['A',a,world(context?'sparse':density)],['B',b,world(context?'dense':density)]].map(([phase,player,world])=>
    ({id:`${group}/${seed}/${index}/${phase}`,phase,phaseRound:1,player,world}));
  return {group,seed,index,scenarios,valid:scenarios.every(s=>s.world.validation.valid)};
}
export function enumerate(f) {
  if(!f.valid)return {fixture:f,blocks:[],admission:{accepted:false,reason:'invalid-geometry'}};
  const spec=specOf(f.group),profiles=profilesOf(f.group),blocks=f.scenarios.map(s=>profiles.map(actions=>
    block(seedFor(f.seed,f.group,'audit'),spec,[s],{baseline:true,learning:false,forced:actions})));
  return {fixture:f,blocks,admission:opportunity(blocks)};
}
export function opportunity(blocks,minimumGap=12) {
  assert.equal(blocks.length,2);
  const sides=blocks.map(bs=>{
    const damages=bs.map(b=>b.rows[0].damage),best=Math.max(...damages),worst=Math.min(...damages),
      optimal=bs.filter(b=>b.rows[0].damage===best).map(b=>actionKey(b.rows[0].actions));
    return {best,worst,range:best-worst,optimal};
  });
  const switchGaps=sides.map((s,i)=>s.best-Math.max(...blocks[i].filter(b=>sides[1-i].optimal.includes(actionKey(b.rows[0].actions))).map(b=>b.rows[0].damage))),
    rewardGaps=sides.map((s,i)=>Math.max(...blocks[i].filter(b=>s.optimal.includes(actionKey(b.rows[0].actions))).map(b=>b.rows[0].feedback[0].reward))-
      Math.max(...blocks[i].filter(b=>sides[1-i].optimal.includes(actionKey(b.rows[0].actions))).map(b=>b.rows[0].feedback[0].reward))),
    observable=blocks.flat().every(b=>b.rows[0].feedback.every(f=>f.observed)),
    disjoint=!sides[0].optimal.some(a=>sides[1].optimal.includes(a)),
    accepted=disjoint&&switchGaps.every(g=>g>=minimumGap)&&rewardGaps.every(g=>g>=.15)&&observable;
  return {accepted,reason:accepted?'qualified':'insufficient-switch-opportunity',sides,switchGaps,rewardGaps,observable,disjoint};
}
