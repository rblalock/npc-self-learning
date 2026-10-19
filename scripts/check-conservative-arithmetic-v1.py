import json
import math
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
prefix = root / (sys.argv[1] if len(sys.argv) > 1 else 'docs/experiments/conservative-development-v1')
r = json.loads(Path(str(prefix) + '.results.json').read_text())
p, summary = r['protocol'], r['summary']
average = lambda xs: math.fsum(xs) / len(xs)
close = lambda a, b: math.isclose(a, b, rel_tol=1e-11, abs_tol=1e-11)
comparisons = 0
for group, output in summary['groups'].items():
    cases = [t for t in r['trials'] if t['group'] == group]
    for arm, result in output['comparisons'].items():
        for label, histories in [('gain', [h for h in p['histories'] if h != 'stable']), ('stable', ['stable'])]:
            pairs = []
            for case in cases:
                def value(a):
                    return average([average([row['damage'] for row in case['histories'][h]['arms'][a]['rows']]) for h in histories])
                pairs.append({'seed': case['seed'], 'left': value(arm), 'right': value('retained'), 'difference': value(arm) - value('retained')})
            assert close(average([x['difference'] for x in pairs]), result[label]['meanDifference'])
            for a, b in zip(sorted(pairs, key=lambda x: x['seed']), result[label]['pairs']):
                assert a['seed'] == b['seed']
                assert all(close(a[k], b[k]) for k in ('left', 'right', 'difference'))
        rows = [row for t in cases for row in t['histories']['stable']['arms'][arm]['rows']]
        count = sum(row['applied'] for row in rows)
        assert count == result['interventions']
        assert close(count / len(rows) * 100, result['interventionRate'])
        assert result['passes'] == all(result['gates'].values())
        comparisons += 1
total = sum(len(t['training']) + sum(len(a['rows']) for h in t['histories'].values() for a in h['arms'].values()) for t in r['trials'])
assert total == summary['budget']['cachedTrainingTransitions'] + summary['budget']['cachedComparisonTransitions']
eligible = [a for a in p['candidates'] if all(g['comparisons'][a]['passes'] for g in summary['groups'].values())]
assert set(eligible) == set(summary['eligible'])
print(json.dumps({'matched': True, 'pairedComparisons': comparisons, 'cachedTransitions': total,
                  'newScoredPhysicalEncounters': 0, 'bootstrapIndependentlyRecomputed': False}, indent=2))
