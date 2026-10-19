import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Arena, TACTICS, WALLS } from '../evidence-baseline.mjs';
import { requireWorld, distance } from '../synthetic/geometry.mjs';
import { createPlayer, observe, FAMILIES } from '../synthetic/players.mjs';
import { createResearchPlayer } from './players.mjs';
import { createPolicy, choose, tacticalActions, rewardsFor } from './policy.mjs';

// Movement, visibility, collisions, targeting and damage remain the archived Arena.update.
// The experiment owns decisions and evidence; finish only captures physical termination.
class PhysicalArena extends Arena {
  finish(result) { if (this.active) { this.active = false; this.physicalResult = result; } }
}
const valid = new Set();
const stateFrame = a => ({ time: a.time, active: a.active, player: { x:a.player.x,y:a.player.y,hp:Math.max(0,a.player.hp) },
  enemies:a.enemies.filter(e=>a.roster.includes(e.role)).map(e=>({id:e.id,role:e.role,tactic:e.tactic,x:e.x,y:e.y,hp:e.hp,windup:e.windup,target:{...e.target}})),
  bullets:a.bullets.map(b=>({x:b.x,y:b.y,enemy:b.enemy})) });

export function combat(scenario, roster, actions, { capture = false } = {}) {
  const key = JSON.stringify(scenario.world);
  if (!valid.has(key)) { requireWorld(scenario.world); valid.add(key); }
  WALLS.splice(0,WALLS.length,...structuredClone(scenario.world.walls));
  const facade = { request(q) {
    if (q.op === 'inspect') return { cells: [] };
    assert.equal(q.op,'choose');
    return { decision_id:0,action:actions[q.role]??TACTICS[q.role][0],probabilities:[],baseline:false };
  } };
  const a = new PhysicalArena(facade); a.roster = roster; a.communication = 'direct';
  a.auto = !!scenario.legacyStyle; if (scenario.legacyStyle) a.style = scenario.legacyStyle;
  a.startEncounter(); Object.assign(a.player,scenario.world.player);
  for (const [i,e] of a.enemies.entries()) {
    Object.assign(e,scenario.world.spawns[i]);
    if (!roster.includes(e.role)) e.hp = 0; // Inactive slots preserve the simulator's bullet-ID indexing.
  }
  const bot = scenario.player ? (FAMILIES.includes(scenario.player.family) ? createPlayer : createResearchPlayer)(scenario.player,scenario.world) : null;
  const hash = createHash('sha256'),frames=capture?[stateFrame(a)]:[],inputs={distance:0,fireFrames:0,dashFrames:0};
  let steps=0;
  while(a.active && steps<1700) {
    const old={x:a.player.x,y:a.player.y},input=bot?.input(observe(a,scenario.world.walls),steps);
    if(input) {
      assert.ok([input.x,input.y,input.aim.x,input.aim.y].every(Number.isFinite));
      assert.ok(Math.hypot(input.x,input.y)<=1.000001);
      hash.update(JSON.stringify(input));inputs.fireFrames+=+input.fire;inputs.dashFrames+=+input.dash;
    }
    a.update(1/60,input);inputs.distance+=distance(old,a.player);steps++;
    if(capture && (steps%6===0 || !a.active))frames.push(stateFrame(a));
  }
  assert.ok(!a.active && a.physicalResult && steps>0 && steps<=1561);
  assert.ok(a.enemies.filter(e=>!roster.includes(e.role)).every(e=>e.damage===0 && e.sightings===0));
  const row={scenario:scenario.id,result:a.physicalResult,duration:a.time,health:Math.max(0,a.player.hp),damage:100-Math.max(0,a.player.hp),steps,
    enemies:a.enemies.filter(e=>roster.includes(e.role)).map(e=>({role:e.role,hp:e.hp,damage:e.damage,sightings:e.sightings})),
    inputSha256:bot?hash.digest('hex'):null,inputs:bot?{...inputs,...bot.stats()}:null};
  return capture?{row,frames}:row;
}
export function encounter(policy,spec,scenario,options={}) {
  const before=policy.request({op:'inspect'}).cells,choices=choose(policy,spec,scenario,options),actions=tacticalActions(spec,choices),
    physical=combat(scenario,spec.roster,actions,options),row=options.capture?physical.row:physical,
    rewards=rewardsFor(spec,row.enemies),feedback=rewards.map((r,i)=>{
      const request={op:'feedback',decision_id:choices[i].decision_id,reward:r.reward,observed:r.observed && options.learning!==false};
      return {...r,request,...policy.request(request)};
    }),after=policy.request({op:'commit'});
  if(options.learning===false || options.baseline)assert.deepEqual(after.cells,before);
  const result={...row,choices,actions,feedback,policy:after.cells,encounter:after.encounter};
  return options.capture?{row:result,frames:physical.frames}:result;
}
export function block(seed,spec,scenarios,options={}) {
  const policy=createPolicy(seed,spec);
  try {
    if(options.snapshot) {policy.request({op:'restore',snapshot:options.snapshot});assert.deepEqual(policy.request({op:'snapshot'}),options.snapshot);}
    const initial=policy.request({op:'snapshot'}),rows=scenarios.map(s=>encounter(policy,spec,s,options)),snapshot=policy.request({op:'snapshot'});
    return {seed,spec,options:{learning:options.learning!==false,baseline:!!options.baseline,forced:options.forced??null},initial,scenarios,rows,snapshot};
  } finally {policy.dispose();}
}
