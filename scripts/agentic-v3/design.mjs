import assert from 'node:assert/strict';
import { observation as previousObservation } from '../agentic-v2/design.mjs';
export { PLANS, sha, mean, schedule, decisionFrom, validateDecision } from '../agentic-v2/design.mjs';

// Both selectors receive the same fields and their own history/previous note.
// Gate state, arm labels and policy scores never become extra planner input.
export function observation(rows, currentPlanId, memory = '', initial = false) {
  const value = previousObservation(rows, currentPlanId, memory, initial ? 'initial' : 'full');
  value.rules += ' Your selection is a recommendation. The host can retain the current plan; currentPlanId and completed observations always describe what actually ran.';
  return value;
}

export function initialGate() {
  return { observedOnPlan: 0 };
}

export function applyGate(state, currentPlanId, proposal, successful, initial, arm, rule) {
  assert.ok(['immediate', 'gated'].includes(arm));
  let next = structuredClone(state);
  let executedPlanId = currentPlanId, reason;
  if (initial) {
    executedPlanId = successful ? proposal.planId : currentPlanId;
    next = initialGate(); reason = 'shared-initial';
  } else if (!successful) {
    reason = 'provider-fallback';
  } else if (arm === 'immediate') {
    executedPlanId = proposal.planId; reason = 'immediate';
  } else if (proposal.planId === currentPlanId) {
    reason = 'retain-recommended';
  } else {
    if (next.observedOnPlan >= rule.minimumObservedFights) {
      executedPlanId = proposal.planId; reason = 'gate-accepted';
    } else reason = 'gate-wait';
  }
  const changed = executedPlanId !== currentPlanId;
  if (changed) next = initialGate();
  return { executedPlanId, changed, reason, before: structuredClone(state), after: next };
}
