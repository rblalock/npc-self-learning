import assert from 'node:assert/strict';
import { createPolicy } from '../research/policy.mjs';
import { specOf } from '../opportunity-v2/fixtures.mjs';
import { sequence, signalRounds } from '../change-detection-v1/design.mjs';
import { seedFor } from '../synthetic/random.mjs';

// This replay bypasses both intervention.mjs and the trial's reward/choice host.
function detector(arm, identities, options) {
  const entries = identities.map(id => ({ ...id, values: [], reference: null, direction: 0, streak: 0 }));
  return (o, armed) => {
    const e = entries.find(e => e.action === o.action && e.role === o.role && e.context === o.context);
    if (!o.observed) return null;
    const w = options.window;
    if (arm === 'batch-soft') {
      e.values = [...e.values, o.reward];
      if (!armed) e.streak = 0;
      if (e.values.length < w) return null;
      const values = e.values, recent = values.reduce((n, v) => n + v, 0) / w;
      e.values = [];
      if (e.reference === null || !armed) { e.reference = recent; e.streak = 0; return null; }
      const older = e.reference, delta = recent - older;
      if (older - recent < options.threshold) { e.reference = recent; e.streak = 0; return null; }
      e.streak += 1;
      if (e.streak !== options.confirmations) return null;
      const event = { role:o.role, context:o.context, action:o.action, older, recent, delta, observations:values, confirmations:e.streak };
      e.reference = recent; e.streak = 0; return event;
    }
    e.values = [...e.values, o.reward].slice(-2 * w);
    if (!armed || e.values.length < 2 * w) { e.streak = 0; e.direction = 0; return null; }
    let older = 0, recent = 0;
    for (let i=0;i<w;i++) { older += e.values[i]; recent += e.values[w+i]; }
    older /= w; recent /= w;
    const delta = recent - older, direction = Math.abs(delta) < options.threshold ? 0 : Math.sign(delta);
    e.streak = direction === 0 ? 0 : direction === e.direction ? e.streak + 1 : 1; e.direction = direction;
    if (e.streak < options.confirmations) return null;
    const event = { role:o.role, context:o.context, action:o.action, older, recent, delta, observations:[...e.values], confirmations:e.streak };
    e.values = e.values.slice(w); e.streak = 0; e.direction = 0; return event;
  };
}
function apply(snapshot, event, soft = false) {
  return { ...snapshot, cells: snapshot.cells.map(c => !event || c.role === event.role && c.context === event.context
    ? { ...c, score: soft ? c.score / 2 : 0, samples: soft ? c.samples : 0 } : c) };
}
const compact = s => s.cells.map(c => [c.score,c.samples]);
export function verify(t, table, p) {
  const f = table.fixture, spec = specOf(f.group), seed = seedFor(f.seed, f.group, 'change-learner');
  assert.equal(t.seed,f.seed); assert.equal(t.group,f.group); assert.equal(t.index,f.index); assert.equal(t.policySeed,seed);
  function rowCheck(policy, row, s, learning) {
    const request = { op:'choose', role:spec.roster[0], context:'arena', allowed:policy.config.roles[0].actions, baseline:false };
    const choice = { request, ...policy.request(request) };
    assert.deepEqual(row.choice,choice); assert.equal(row.round,s.round); assert.equal(row.side,s.side);
    const original = table.blocks[s.side].find(b=>b.rows[0].choices[0].action===choice.action).rows[0], e=original.enemies[0];
    const reward=Math.max(-1,Math.min(1,e.damage/32-.22-(e.hp<=0?.18:0))), observed=e.sightings>0&&learning;
    assert.equal(row.reward,reward); assert.equal(row.observed,observed); assert.equal(row.damage,original.damage);
    policy.request({op:'feedback',decision_id:choice.decision_id,reward,observed}); policy.request({op:'commit'});
    const snapshot=policy.request({op:'snapshot'});
    assert.deepEqual(row.learned,compact(snapshot)); assert.equal(row.rng,snapshot.rng_state);
    return { snapshot, observation:{role:request.role,context:'arena',action:choice.action,reward,observed} };
  }
  const training=createPolicy(seed,spec), trainingSchedule=sequence(f,'stable',p.training_rounds,{training:true});
  const warmup=[];
  try {
    assert.equal(t.training.length,trainingSchedule.length);
    for(const [i,s] of trainingSchedule.entries()) {
      const row=t.training[i]; assert.equal(row.event,null); assert.equal(row.applied,false); assert.equal(row.signal,false);
      warmup.push(rowCheck(training,row,s,true).observation);
    }
    assert.deepEqual(t.checkpoint,training.request({op:'snapshot'}));
  } finally {training.dispose();}
  let count=t.training.length;
  assert.deepEqual(Object.keys(t.histories),Object.keys(p.histories));
  for(const [h,n] of Object.entries(p.histories)) {
    const schedule=sequence(f,h,n), signals=signalRounds(table,schedule), history=t.histories[h];
    assert.deepEqual(history.signals,signals); assert.deepEqual(Object.keys(history.arms),p.arms);
    for(const arm of p.arms) {
      const policy=createPolicy(seed,spec), rows=history.arms[arm].rows;
      try {
        policy.request({op:'restore',snapshot:t.checkpoint}); assert.equal(rows.length,n);
        const feed=detector(arm,t.checkpoint.cells,p.legacy_detector);
        for(const o of warmup)feed(o,false);
        for(const [i,s] of schedule.entries()) {
          const row=rows[i], signal=arm==='signaled-reset'&&signals.includes(s.round);
          assert.equal(row.signal,signal);
          if(signal)policy.request({op:'restore',snapshot:apply(policy.request({op:'snapshot'}),null)});
          const {snapshot,observation}=rowCheck(policy,row,s,arm!=='frozen');
          const event=['legacy-reset',...p.candidates].includes(arm)?feed(observation,true):null;
          assert.deepEqual(row.event,event);
          const applied=!!event&&(arm==='legacy-reset'||event.delta<0); assert.equal(row.applied,applied);
          const next=applied?apply(snapshot,event,arm.endsWith('soft')):snapshot;
          assert.deepEqual(row.after,compact(next));
          if(applied)policy.request({op:'restore',snapshot:next});
          count++;
        }
        assert.deepEqual(history.arms[arm].final,policy.request({op:'snapshot'}));
      } finally {policy.dispose();}
    }
  }
  return count;
}
