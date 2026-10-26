#!/usr/bin/env python3
"""Independently check descriptive arithmetic; does not replay combat or models."""
import gzip
import json
import math
from pathlib import Path
import statistics
import sys

source = Path(sys.argv[1])
raw = source.read_bytes()
r = json.loads(gzip.decompress(raw) if source.suffix == '.gz' else raw)
s = json.loads(Path(sys.argv[2]).read_text())
mean = statistics.mean

def equal(a, b):
    assert abs(a-b) < 1e-9, (a,b)

calibration_fights = 0
for calibration in r['calibration']:
    values = {p['planId']: [] for p in calibration['selection']['means']}
    for batch in calibration['data']['batches']:
        calibration_fights += len(batch['training']['rows'])
        for branches in batch['histories'].values():
            for branch in branches:
                values[branch['planId']].extend(row['physical']['damage'] for row in branch['rows'])
                calibration_fights += len(branch['rows'])
    for plan in calibration['selection']['means']:
        equal(mean(values[plan['planId']]), plan['meanDamage'])
    assert calibration['selection']['planId'] == max(values, key=lambda k: mean(values[k]))

evaluation_fights = 0
pairs = []
for case in r['cases']:
    evaluation_fights += len(case['training']['rows'])
    for history, branches in case['histories'].items():
        arms = {}
        for branch in branches:
            fights = [row.get('fight',row) for row in branch['rows']]
            values = [row['physical']['damage'] for row in fights]
            evaluation_fights += len(fights)
            arms.setdefault(branch['arm'], []).append(mean(values))
        values = {arm: mean(scores) for arm,scores in arms.items()}
        expected = next(p for p in s['pairs'] if p['seed']==case['seed'] and p['index']==case['index'] and p['history']==history)
        for arm, score in values.items(): equal(score,expected['means'][arm])
        differences = {'fullVsRetained':values['full']-values['retained'],
            'fullVsFixed':values['full']-values['fixed'],
            'fullVsInitial':values['full']-values['initial'],
            'fullVsRecent':values['full']-values['recent'],
            'recentVsFixed':values['recent']-values['fixed']}
        for key,value in differences.items(): equal(value,expected['differences'][key])
        pairs.append({'seed':case['seed'],'index':case['index'],'history':history,'means':values,'differences':differences})

for history, expected in s['byHistory'].items():
    subset = [p for p in pairs if p['history']==history]
    for field in ['means','differences']:
        for key, value in expected[field].items(): equal(mean(p[field][key] for p in subset),value)
assert calibration_fights == s['calibrationFights']
assert evaluation_fights == s['evaluationFights']
assert calibration_fights+evaluation_fights == s['scoredFights']
assert len({c['id'] for c in r['calls']}) == s['recordedCalls'] == len(r['calls'])
assert sum(c['response']['status']=='ok' for c in r['calls']) == s['successfulCalls']
costs = [c['response']['metadata'].get('costUsd') for c in r['calls']]
assert sum(x is None for x in costs) == s['unknownCostCalls']
equal(sum(x for x in costs if x is not None),s['knownReportedCostUsd'])
if all(x is not None for x in costs): equal(sum(costs),s['reportedCostUsd'])
durations = sorted(c['response']['metadata']['durationMs'] for c in r['calls'] if isinstance(c['response']['metadata'].get('durationMs'),(float,int)))
equal(mean(durations),s['meanLatencyMs'])
equal(durations[math.ceil(len(durations)*.95)-1],s['p95LatencyMs'])
print(json.dumps({'verified':True,'scope':'Independent descriptive arithmetic only; no physical replay or model requests.',
    'calibrationFights':calibration_fights,'evaluationFights':evaluation_fights,'uniqueCalls':len(r['calls']),
    'calibrationSelectionsMatched':True,'allCaseAndHistoryMeansMatched':True,'costAndLatencyMatched':True,'pairs':pairs},indent=2))
