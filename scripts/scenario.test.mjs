import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { Arena, makePolicy, WALLS } from './evidence-baseline.mjs';
import { scenarioArena, runScenarioTrial, setScenario } from './scenario-trial.mjs';

const protocol = JSON.parse(await readFile(new URL('../docs/experiments/scenario-transfer-v1.protocol.json',import.meta.url)));
const original = {id:'original',walls:structuredClone(WALLS),spawns:[{x:105,y:300},{x:815,y:475},{x:790,y:105}]};

test('scenario adapter on original geometry reproduces original combat and policy exactly', t => {
  const a = new Arena(makePolicy(2003)), b=scenarioArena(original,2003);
  t.after(()=>{a.policy.dispose();b.policy.dispose();});
  for(let i=0;i<3;i++) {
    const x=a.runEncounter('reverse'),y=b.runEncounter('reverse');
    assert.deepEqual([x.damage,x.result,x.duration],[y.damage,y.result,y.duration]);
    assert.deepEqual(a.inspect().cells,b.inspect().cells);
  }
});

test('declared cover and spawns take effect without altering health or tactics', t => {
  for(const scenario of protocol.scenarios) {
    const a=scenarioArena(scenario,2003);t.after(()=>a.policy.dispose());
    a.startEncounter();
    assert.deepEqual(WALLS,scenario.walls);
    assert.deepEqual(a.enemies.map(e=>({x:e.x,y:e.y})),scenario.spawns);
    assert.ok(a.enemies.every(e=>e.hp===72));assert.equal(a.player.hp,100);
  }
  assert.throws(()=>setScenario({...original,spawns:[{x:0,y:0},...original.spawns.slice(1)]}));
});

test('scenario trial serial and worker paths agree; both reward rules preserve frozen branches', async()=>{
  const p={...protocol,training_rounds:2,post_switch_rounds:2};
  for(const mode of ['individual','additive-team']) {
    const scenario=p.scenarios[2], serial=runScenarioTrial(p,scenario,2003,mode);
    const parallel=await new Promise((resolve,reject)=>{
      const w=new Worker(new URL('./scenario-worker.mjs',import.meta.url),{workerData:{protocol:p,scenario,seed:2003,mode}});
      w.once('message',resolve);w.once('error',reject);
      w.once('exit',code=>{if(code)reject(Error(String(code)));});
    });
    assert.deepEqual(parallel,serial);assert.equal(serial.encounters,10);
    for(const style of p.switches) assert.deepEqual(serial.trial.branches[style]['trained-frozen'].at(-1).policy,serial.trial.training.online.at(-1).policy);
  }
});
