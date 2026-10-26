import assert from 'node:assert/strict';
import { fixture } from '../opportunity-v2/fixtures.mjs';
import { randomAt, seedFor } from '../synthetic/random.mjs';
import { PLANS, publicRound, validateDecision } from '../agentic-v1/design.mjs';
export { PLANS, validateDecision };

export function surveySchedule(c,p) {
  const f=fixture('solo-ranger',c.seed,c.index);assert.ok(f.valid);
  const stream=seedFor(c.seed,c.index,'agentic-matched-v4-survey');
  const order=[...PLANS.map(x=>x.id),...PLANS.map(x=>x.id).reverse()];
  assert.deepEqual(p.survey.order,order,'Survey must execute the frozen two passes');
  return order.map((planId,i)=>{
    const probabilityB=p.survey.probabilityB,side=+(randomAt(stream,'mixture',i)<probabilityB);
    return {round:i+1,planId,side,probabilityB,scenario:structuredClone(f.scenarios[side])};
  });
}
export function observation(rows,currentPlanId,memory,p) {
  assert.ok(rows.length>=p.warmupRounds+p.survey.order.length);
  assert.equal(typeof memory,'string');assert.ok([...memory].length<=1500);
  return {schema:1,
    objective:'Improve the enemy ranger NPC: maximize damage dealt over future rounds. The player is the opponent, never the beneficiary of your changes.',
    nextRound:rows.length+1,preparationRounds:p.warmupRounds+p.survey.order.length,currentPlanId,plans:structuredClone(PLANS),
    rules:'Choose one supported plan for the next round. Health, damage, movement speed, cooldowns and visibility are fixed. All supplied history is completed, legitimately observed evidence. Conditions can stay stable or change; you do not know whether or when. Keeping a plan is allowed. No additional simulation queries. Internal policy scores are not supplied. The first '+p.warmupRounds+' fights used baseline; the next '+p.survey.order.length+' fights tried every plan in two passes. These are real sequential fights with continued Rust learning, not counterfactual outcomes. The current plan and recorded fights are authoritative about what actually executed.',
    history:rows.map(publicRound),memory};
}
// All statistics use only public completed observations. Unobserved fights age
// older observations but contribute neither damage nor effective count.
export function algorithmStatistics(obs, selector) {
  assert.equal(selector.id,'discounted-ucb');
  const scores=PLANS.map(plan=>{
    let n=0,total=0;
    for(const row of obs.history) {
      if(row.planId!==plan.id || !row.observed || !Number.isFinite(row.npcDamage))continue;
      const age=obs.nextRound-1-row.round;
      assert.ok(age>=0,'Observation is in the future');
      const weight=2**(-age/selector.halfLifeFights);
      n+=weight;total+=weight*Math.min(selector.damageCapHp,row.npcDamage);
    }
    return {planId:plan.id,effectiveCount:n,weightedMean:n?total/n:null};
  });
  const totalEffectiveCount=scores.reduce((n,x)=>n+x.effectiveCount,0);
  const initial=obs.history.length===obs.preparationRounds;
  return scores.map(x=>({...x,totalEffectiveCount,
    score:x.effectiveCount ? x.weightedMean+(initial?0:selector.explorationHp*Math.sqrt(Math.log(1+totalEffectiveCount)/x.effectiveCount))
      : (initial?-Infinity:Infinity)}));
}
export function algorithmDecision(obs, selector) {
  const scores=algorithmStatistics(obs,selector);
  let best=scores.reduce((a,b)=>b.score>a.score?b:a);
  const current=scores.find(x=>x.planId===obs.currentPlanId);
  if(current.score===best.score)best=current;
  return validateDecision({planId:best.planId,
    reason:'Recency-weighted NPC damage with a 12-fight half-life; initial selection uses the weighted mean, subsequent selection adds a 12-HP UCB exploration term. Equal scores retain the current plan, then catalog order.',
    prediction:'Balance observed NPC damage with uncertainty about less-sampled plans.',memory:''});
}
