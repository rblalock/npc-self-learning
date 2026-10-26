#!/usr/bin/env python3
"""Independent recorded arithmetic; no model or physical simulation requests."""
import gzip
import json
import math
from pathlib import Path
import statistics
import sys


def read(path):
    raw = Path(path).read_bytes()
    return json.loads(gzip.decompress(raw) if str(path).endswith('.gz') else raw)


def same(a, b):
    assert math.isclose(a, b, rel_tol=1e-10, abs_tol=1e-10), (a, b)


r, s = read(sys.argv[1]), read(sys.argv[2])
assert not r.get('incomplete')
p = r['protocol']
preparation, evaluation = 0, 0
pairs = []
paired = []
for case in r['cases']:
    preparation += len(case['training']['rows'])
    for history, branches in case['histories'].items():
        arms = {}
        for b in branches:
            fights = [x.get('fight', x) for x in b['rows']]
            evaluation += len(fights)
            damage = [f['physical']['damage'] for f in fights]
            arms.setdefault(b['arm'], {})[b['replicate']] = statistics.mean(damage)
        means = {k: statistics.mean(v.values()) for k, v in arms.items()}
        expected = next(x for x in s['pairs'] if (x['seed'], x['index'], x['history']) == (case['seed'], case['index'], history))
        for k, v in means.items():
            same(v, expected['means'][k])
        survey_damage = sum(x['physical']['damage'] for x in case['training']['survey']['rows'])
        cumulative = {k: (survey_damage + v * p['postRounds']) / (len(case['training']['survey']['rows']) + p['postRounds']) for k, v in means.items()}
        for k, v in cumulative.items():
            same(v, expected['cumulativeMeans'][k])
        pairs.append({'seed': case['seed'], 'index': case['index'], 'history': history, 'means': means, 'cumulativeMeans': cumulative})
        for rep, value in arms['agent'].items():
            paired.append({'seed': case['seed'], 'index': case['index'], 'history': history, 'replicate': rep,
                           'agentVsAlgorithm': value - means['algorithm'],
                           'agentVsInitial': value - arms['agent-initial'][rep],
                           'agentVsAlgorithmInitial': value - means['algorithm-initial'],
                           'heldAgentVsHeldAlgorithm': arms['agent-initial'][rep] - means['algorithm-initial']})
contrasts = {'agentVsAlgorithm': ('agent', 'algorithm'), 'agentVsInitial': ('agent', 'agent-initial'),
             'algorithmVsInitial': ('algorithm', 'algorithm-initial'), 'agentVsFixed': ('agent', 'fixed'),
             'agentVsRetained': ('agent', 'retained'), 'agentVsAlgorithmInitial': ('agent', 'algorithm-initial'),
             'heldAgentVsHeldAlgorithm': ('agent-initial', 'algorithm-initial')}
for h in [*p['histories'], 'overall']:
    rows = pairs if h == 'overall' else [x for x in pairs if x['history'] == h]
    means = {k: statistics.mean(x['means'][k] for x in rows) for k in rows[0]['means']}
    target = s['overall'] if h == 'overall' else s['byHistory'][h]
    for k, v in means.items():
        same(v, target['means'][k])
        same(statistics.mean(x['cumulativeMeans'][k] for x in rows), target['cumulativeMeans'][k])
    for k, (a, b) in contrasts.items():
        same(means[a] - means[b], target['differences'][k])
assert preparation == s['preparationFights']
assert evaluation == s['evaluationFights']
assert preparation + evaluation == s['scoredFights']
assert len(r['calls']) == len({c['id'] for c in r['calls']}) == s['recordedCalls']
costs = [c['response']['metadata']['costUsd'] for c in r['calls']]
known = [x for x in costs if x is not None]
same(sum(known), s['knownReportedCostUsd'])
assert len(costs) - len(known) == s['unknownCostCalls']
if len(costs) == len(known):
    same(sum(known), s['reportedCostUsd'])
durations = sorted(c['response']['metadata']['durationMs'] for c in r['calls'])
same(statistics.mean(durations), s['meanLatencyMs'])
same(durations[math.ceil(len(durations) * .95) - 1], s['p95LatencyMs'])
gate = p['advanceGates']
keys = ['agentVsAlgorithm', 'agentVsAlgorithmInitial', 'agentVsInitial']
cell_diffs = [{k: x['means'][a] - x['means'][b] for k, (a, b) in contrasts.items()} for x in pairs]
rep_diffs = [{k: statistics.mean(x[k] for x in paired if x['replicate'] == rep) for k in [*keys, 'heldAgentVsHeldAlgorithm']} for rep in range(1, p['agentReplicates'] + 1)]
overall = {k: statistics.mean(x[k] for x in cell_diffs) for k in contrasts}
review_checks = {'gainOverActiveAlgorithm': overall['agentVsAlgorithm'] >= gate['agentVsAlgorithmHp'],
                 'gainOverHeldAlgorithm': overall['agentVsAlgorithmInitial'] >= gate['agentVsAlgorithmInitialHp'],
                 'gainOverOwnInitial': overall['agentVsInitial'] >= gate['agentVsInitialHp'],
                 'positiveEachReplicate': all(x[k] > 0 for x in rep_diffs for k in keys),
                 'cellHarm': all(x[k] >= -gate['maximumCellHarmHp'] for x in cell_diffs for k in keys)}
held_checks = {'gain': overall['heldAgentVsHeldAlgorithm'] >= gate['agentVsAlgorithmInitialHp'],
               'positiveEachReplicate': all(x['heldAgentVsHeldAlgorithm'] > 0 for x in rep_diffs),
               'cellHarm': all(x['heldAgentVsHeldAlgorithm'] >= -gate['maximumCellHarmHp'] for x in cell_diffs)}
algorithm_checks = {'gain': overall['algorithmVsInitial'] >= 1,
                    'cellHarm': all(x['algorithmVsInitial'] >= -gate['maximumCellHarmHp'] for x in cell_diffs)}
advance_review = all(review_checks.values())
advance_held = not advance_review and all(held_checks.values())
expected_decision = {'reviewChecks': review_checks, 'heldChecks': held_checks, 'algorithmChecks': algorithm_checks,
                     'advanceContinuousReview': advance_review, 'advanceHeldAgent': advance_held,
                     'algorithmReviewEarned': all(algorithm_checks.values()), 'agentDevelopmentStop': not advance_review and not advance_held}
assert s['decision'] == expected_decision
algorithm_durations = sorted(x['durationMs'] for x in r['algorithmRuntime'])
assert len(algorithm_durations) == s['algorithmSelectionCalls']
same(statistics.mean(algorithm_durations), s['meanAlgorithmLatencyMs'])
same(algorithm_durations[math.ceil(len(algorithm_durations) * .95) - 1], s['p95AlgorithmLatencyMs'])
print(json.dumps({'verified': True, 'method': 'Independent Python arithmetic and advancement gates', 'preparationFights': preparation,
                  'evaluationFights': evaluation, 'totalPhysicalFights': preparation + evaluation,
                  'uniqueRequests': len(costs), 'knownReportedCostUsd': sum(known), 'pairs': pairs,
                  'paired': paired, 'decision': expected_decision, 'modelCallsMade': 0}, indent=2))
