import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { POLICY_CONFIG, baselineRoot, TACTICS } from '../evidence-baseline.mjs';
import { fixedProfiles } from '../evaluation-support.mjs';
import { randomAt, seedFor } from '../synthetic/random.mjs';

const { TacticalEngine } = await import(pathToFileURL(resolve(baselineRoot, 'apps/arena/public/wasm/tactical_air.js')));
export const ROLES = Object.keys(TACTICS);
export const PROFILES = fixedProfiles().map((p, i) => ({ ...p, action: `combo-${i}` }));
export const clamp = x => Math.max(-1, Math.min(1, x));

export function specification({ roster = ROLES, architecture = 'independent', reward = 'individual', context = 'pooled' } = {}) {
  assert.ok(roster.length && roster.every(r => ROLES.includes(r)) && new Set(roster).size === roster.length);
  assert.ok(['independent', 'joint'].includes(architecture));
  assert.ok(['individual', 'shared'].includes(reward));
  assert.ok(['pooled', 'terrain', 'shuffled'].includes(context));
  if (architecture === 'joint') { assert.deepEqual(roster, ROLES); assert.equal(reward, 'shared'); }
  return { roster, architecture, reward, context };
}
export function configFor(seed, spec) {
  specification(spec);
  return { ...POLICY_CONFIG, seed,
    roles: spec.architecture === 'joint' ? [{ id: 'squad', actions: PROFILES.map(p => p.action) }]
      : spec.roster.map(id => ({ id, actions: TACTICS[id] })),
    contexts: spec.context === 'pooled' ? ['arena'] : ['sparse', 'dense'] };
}
export function createPolicy(seed, spec) {
  const config = configFor(seed, spec), engine = new TacticalEngine(JSON.stringify(config));
  return { config, request(request) {
    const response = JSON.parse(engine.request(JSON.stringify(request)));
    if (!response.ok) throw Error(response.error);
    return response.data;
  }, dispose() { engine.free(); } };
}
export function terrainContext(world) {
  return world.walls.reduce((s, w) => s + w.w * w.h, 0) / (920 * 600) > .055 ? 'dense' : 'sparse';
}
export function contextFor(spec, scenario, seed) {
  if (spec.context === 'pooled') return 'arena';
  if (spec.context === 'terrain') return terrainContext(scenario.world);
  return randomAt(seedFor(seed, scenario.id), 'sham-context') < .5 ? 'sparse' : 'dense';
}
export function choose(policy, spec, scenario, { baseline = false, forced } = {}) {
  const context = contextFor(spec, scenario, policy.config.seed);
  return policy.config.roles.map(({ id: role, actions }) => {
    const allowed = forced ? [forced[role]] : actions;
    assert.ok(allowed.every(a => actions.includes(a)));
    const request = { op: 'choose', role, context, allowed, baseline };
    return { request, ...policy.request(request) };
  });
}
export function tacticalActions(spec, choices) {
  if (spec.architecture === 'joint') return { ...PROFILES.find(p => p.action === choices[0].action).actions };
  return Object.fromEntries(choices.map(c => [c.request.role, c.action]));
}
export function rewardsFor(spec, enemies) {
  assert.deepEqual(enemies.map(e => e.role), spec.roster);
  if (spec.reward === 'shared') {
    const reward = 2 * Math.min(100, enemies.reduce((s, e) => s + e.damage, 0)) / 100 - 1;
    const observed = enemies.every(e => e.sightings > 0);
    return (spec.architecture === 'joint' ? ['squad'] : spec.roster).map(role => ({ role, reward, observed }));
  }
  return enemies.map(e => ({ role: e.role, reward: clamp(e.damage / 32 - .22 - (e.hp <= 0 ? .18 : 0)), observed: e.sightings > 0 }));
}
export function alignedMemory(current, source) {
  assert.deepEqual(current.config, source.config);
  // An explicitly logged experimental memory intervention, not an online classifier.
  return { ...structuredClone(current), cells: structuredClone(source.cells) };
}
