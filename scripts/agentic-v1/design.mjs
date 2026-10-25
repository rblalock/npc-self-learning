import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture } from '../opportunity-v2/fixtures.mjs';
import { randomAt, seedFor } from '../synthetic/random.mjs';

export const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const PLANS = Object.freeze([
  { id: 'baseline', description: 'Ordinary learned aim/lead choice; 275 unit engagement distance; normal lead prediction.', action: null, tuning: { rangerDistance: 275, rangerLeadScale: 1 } },
  { id: 'aim', description: 'Aim directly at observed position; 275 unit distance.', action: 'aim', tuning: { rangerDistance: 275, rangerLeadScale: 1 } },
  { id: 'lead', description: 'Predict observed movement; 275 unit distance; normal lead prediction.', action: 'lead', tuning: { rangerDistance: 275, rangerLeadScale: 1 } },
  { id: 'close', description: 'Ordinary learned aim/lead choice; approach to 200 units.', action: null, tuning: { rangerDistance: 200, rangerLeadScale: 1 } },
  { id: 'far', description: 'Ordinary learned aim/lead choice; keep 340 units away.', action: null, tuning: { rangerDistance: 340, rangerLeadScale: 1 } },
  { id: 'short-lead', description: 'Lead movement with half the normal prediction time; 275 unit distance.', action: 'lead', tuning: { rangerDistance: 275, rangerLeadScale: .5 } },
  { id: 'long-lead', description: 'Lead movement with 1.5 times the normal prediction time; 275 unit distance.', action: 'lead', tuning: { rangerDistance: 275, rangerLeadScale: 1.5 } },
]);
export const planById = id => { const plan = PLANS.find(p => p.id === id); assert.ok(plan, 'Unknown NPC plan'); return plan; };
export const mean = values => values.length ? values.reduce((a,b) => a+b,0)/values.length : null;

export function makeSchedule(c, protocol, history = 'warmup') {
  const f = fixture('solo-ranger', c.seed, c.index);
  assert.ok(f.valid, 'Invalid case geometry');
  const count = history === 'warmup' ? protocol.warmupRounds : protocol.postRounds;
  const firstChange = 3 + Math.floor(randomAt(c.seed, 'agentic-change-timing') * 3);
  const returnRound = protocol.postRounds - 4;
  return Array.from({length: count}, (_,i) => {
    const round = i+1;
    const probabilityB = history === 'recurring' && round >= firstChange && round < returnRound ? .9 : .1;
    const draw = randomAt(seedFor(c.seed, 'agentic-schedule-v1'), history, i);
    const side = +(draw < probabilityB);
    return { round, side, probabilityB, scenario: structuredClone(f.scenarios[side]) };
  });
}

// This is an allowlist, never a spread of the evaluator's case, row or snapshot.
export function publicRound(row) {
  const enemy = row.physical.enemies.find(e => e.role === 'ranger');
  return {
    round: row.round, planId: row.planId, tactic: row.choice.action,
    reward: row.feedback.observed ? row.feedback.reward : null,
    observed: row.feedback.observed,
    npcDamage: row.feedback.observed ? enemy.damage : null,
    npcRemainingHealth: enemy.hp, duration: row.physical.duration,
    telemetry: row.physical.npcTelemetry.map(({role,visibleSeconds,meanVisibleSpeed,stoppedFraction,meanVisibleRange,shotsFired,hits}) =>
      ({role,visibleSeconds,meanVisibleSpeed,stoppedFraction,meanVisibleRange,shotsFired,hits})),
  };
}

export function makeObservation(rows, inspection, currentPlanId, memory = '') {
  assert.equal(typeof memory, 'string');
  assert.ok([...memory].length <= 1500);
  return {
    schema: 1,
    objective: 'Improve the enemy ranger NPC: maximize damage dealt over future rounds. The player is the opponent, never the beneficiary of your changes.',
    nextRound: rows.length + 1,
    currentPlanId,
    plans: structuredClone(PLANS),
    rules: 'Choose one supported plan for the next round. All plans keep health, damage, movement speed, cooldowns and visibility fixed. Only completed, legitimately observed evidence is available. Conditions can stay stable or change; you do not know whether or when. Keeping a plan is allowed. No additional simulation queries.',
    history: rows.map(publicRound),
    policy: inspection.cells.map(({role,context,action,score,samples,probability}) => ({role,context,action,score,samples,probability})),
    memory,
  };
}

export function validateDecision(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Expected decision object');
  assert.deepEqual(Object.keys(value).sort(), ['memory','planId','prediction','reason']);
  planById(value.planId);
  for (const [key, limit] of [['reason',500],['prediction',300],['memory',1500]]) {
    assert.equal(typeof value[key], 'string', `${key} must be text`);
    assert.ok([...value[key]].length <= limit, `${key} too long`);
  }
  return structuredClone(value);
}

export function statisticalDecision(observation) {
  // Sliding-window UCB on NPC damage, the same primary objective as the agent.
  // All scored exploratory rounds count.
  // Existing warm-up is valid evidence for the baseline plan only.
  const recent = observation.history.slice(-16).filter(r => r.observed);
  const scores = PLANS.map(p => {
    const rewards = recent.filter(r => r.planId === p.id).map(r => Math.min(100,r.npcDamage)/100);
    return { id:p.id, value: rewards.length ? mean(rewards)+.35*Math.sqrt(Math.log(recent.length+1)/rewards.length) : Infinity };
  });
  const selected = scores.reduce((a,b) => b.value>a.value ? b : a);
  return {planId:selected.id,reason:'Sliding-window UCB over observed NPC damage; untried plans are explored in declared order.',prediction:'Improve NPC damage while sampling uncertain plans.',memory:''};
}

export function randomDecision(seed, round) {
  const plan = PLANS[Math.floor(randomAt(seed,'random-plans',round)*PLANS.length)];
  return {planId:plan.id,reason:'Uniform random legal plan.',prediction:'No outcome prediction.',memory:''};
}
