import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Arena, POLICY_CONFIG, baselineRoot } from '../evidence-baseline.mjs';

// The archived harness has initialized this exact archived Wasm module.
const { TacticalEngine } = await import(pathToFileURL(resolve(baselineRoot,'apps/arena/public/wasm/tactical_air.js')));
export function configFor(seed,variant='original') {
  assert.ok(['original','no-decay'].includes(variant));
  return {...POLICY_CONFIG,seed,decay:variant==='no-decay'?0:POLICY_CONFIG.decay};
}
export function makeRetentionPolicy(seed,variant='original') {
  const engine=new TacticalEngine(JSON.stringify(configFor(seed,variant)));
  return {request(request) {
    const r=JSON.parse(engine.request(JSON.stringify(request)));
    if(!r.ok) throw Error(r.error);
    return r.data;
  },dispose(){engine.free();}};
}
export function retentionArena(seed,{variant='original',snapshot,learning=true}={}) {
  const policy=makeRetentionPolicy(seed,variant);
  try {
    if(snapshot) {
      policy.request({op:'restore',snapshot});
      assert.deepEqual(policy.request({op:'snapshot'}),snapshot);
    }
    const arena=new Arena(policy);
    arena.learning=learning;arena.communication='direct';
    return arena;
  } catch(e) {policy.dispose();throw e;}
}
