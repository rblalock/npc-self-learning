#!/usr/bin/env python3
"""Independent descriptive arithmetic; no model or simulation requests."""
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys

def read(path):
    data = Path(path).read_bytes()
    return json.loads(gzip.decompress(data) if str(path).endswith('.gz') else data)

def same(a, b):
    assert math.isclose(a, b, rel_tol=1e-10, abs_tol=1e-10), (a, b)

r = read(sys.argv[1])
s = read(sys.argv[2])
assert not r.get('incomplete')
p = r['protocol']
assert len(r['calls']) == len({c['id'] for c in r['calls']})
count = 0
pairs = []
switches = {'immediate': 0, 'gated': 0}
blocks = 0
paired = []
for case in r['cases']:
    count += len(case['training']['rows'])
    for history, branches in case['histories'].items():
        arms = {}
        for b in branches:
            fights = [x.get('fight', x) for x in b['rows']]
            count += len(fights)
            damages = [f['physical']['damage'] for f in fights]
            arms.setdefault(b['arm'], {})[b['replicate']] = statistics.mean(damages)
            if b['arm'] not in switches:
                continue
            current, observed = 'baseline', 0
            for i, row in enumerate(b['rows']):
                actual = row['fight']['planId']
                gate = row['gate']
                assert gate['before']['observedOnPlan'] == observed
                if i and actual != current:
                    switches[b['arm']] += 1
                    if b['arm'] == 'gated':
                        assert observed >= p['gate']['minimumObservedFights']
                if not i or actual != current:
                    observed = 0
                observed += bool(row['fight']['feedback']['observed'])
                assert gate['after']['observedOnPlan'] == observed
                assert actual == gate['executedPlanId']
                if gate['reason'] == 'gate-wait':
                    blocks += 1
                    assert actual == current and row['decision']['planId'] != actual
                current = actual
        values = {k: statistics.mean(v.values()) for k, v in arms.items()}
        expected = next(x for x in s['pairs'] if x['seed'] == case['seed'] and x['index'] == case['index'] and x['history'] == history)
        for k, v in values.items():
            same(v, expected['means'][k])
        pairs.append({'seed': case['seed'], 'index': case['index'], 'history': history, 'means': values})
        for rep, value in arms['gated'].items():
            paired.append({'seed': case['seed'], 'history': history, 'replicate': rep,
                           'gatedVsImmediate': value-arms['immediate'][rep],
                           'gatedVsInitial': value-arms['initial'][rep]})

for h in [*p['histories'], 'overall']:
    rows = pairs if h == 'overall' else [x for x in pairs if x['history'] == h]
    means = {k: statistics.mean(x['means'][k] for x in rows) for k in rows[0]['means']}
    target = s['overall'] if h == 'overall' else s['byHistory'][h]
    for k, v in means.items():
        same(v, target['means'][k])
    for suffix, arm in [('Immediate','immediate'),('Initial','initial'),('Fixed','fixed'),('Retained','retained')]:
        same(means['gated']-means[arm], target['differences']['gatedVs'+suffix])
assert count == s['evaluationFights'] == s['scoredFights']
assert len(r['calls']) == s['recordedCalls']
costs = [c['response']['metadata']['costUsd'] for c in r['calls']]
known = [c for c in costs if c is not None]
same(sum(known), s['knownReportedCostUsd'])
assert len(costs)-len(known) == s['unknownCostCalls']
if len(known) == len(costs):
    same(sum(known), s['reportedCostUsd'])
durations = sorted(c['response']['metadata']['durationMs'] for c in r['calls'])
same(statistics.mean(durations), s['meanLatencyMs'])
same(durations[math.ceil(len(durations)*.95)-1], s['p95LatencyMs'])
for arm, n in switches.items():
    assert n == sum(x['subsequentSwitches'] for pair in s['pairs'] for x in pair['arms'][arm])
assert blocks == sum(x['blockedProposals'] for pair in s['pairs'] for x in pair['arms']['gated'])
print(json.dumps({'verified': True, 'method': 'Independent Python arithmetic and gate-state accounting',
    'evaluationFights': count, 'uniqueRequests': len(costs), 'knownReportedCostUsd': sum(known),
    'subsequentSwitches': switches, 'blockedProposals': blocks, 'pairs': pairs, 'paired': paired,
    'modelCallsMade': 0}, indent=2))
