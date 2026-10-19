"""Independent raw-result arithmetic checks; no JS analysis imports."""
import hashlib,json,statistics,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
path=root/'docs/experiments/change-detection-v1.results.json'
raw=path.read_bytes();r=json.loads(raw);s=r['summary']
checks=[];decisions=0
for group,summary in s['groups'].items():
 trials=[t for t in r['trials'] if t['group']==group]
 assert len(trials)==summary['qualified']
 for arm in ['detector-reset','detector-selective']:
  gain=[];stable=[];false=0
  for t in trials:
   def avg(h,a): return statistics.mean(x['block']['rows'][0]['damage'] for x in t['histories'][h]['arms'][a]['steps'])
   gain.append(statistics.mean(avg(h,arm)-avg(h,'retained') for h in ['abrupt','gradual','recurring']))
   stable.append(avg('stable',arm)-avg('stable','retained'))
   false+=sum(x['event'] is not None for x in t['histories']['stable']['arms'][arm]['steps'])
  c=summary['comparisons'][arm]
  assert abs(statistics.mean(gain)-c['primary']['meanDifference'])<1e-12
  assert abs(statistics.mean(stable)-c['stability']['meanDifference'])<1e-12
  assert false==c['falseAlarms']
  assert false/(len(trials)*64)*100==c['falseAlarmsPer100']
  assert all(abs(x-y['difference'])<1e-12 for x,y in zip(gain,c['primary']['pairs']))
  checks.append({'group':group,'arm':arm,'gain':statistics.mean(gain),'stableGain':statistics.mean(stable),'falseAlarms':false})
for t in r['trials']:
 decisions+=len(t['training']['rows'])
 for history in t['histories'].values():
  for arm in history['arms'].values():
   for step in arm['steps']:
    b=step['block'];decisions+=len(b['rows'])
    original={k:v for k,v in b['snapshot'].items() if k!='cells'}
    kept={k:v for k,v in step['afterIntervention'].items() if k!='cells'}
    assert original==kept
assert decisions==s['budget']['learningEncounters']
a=json.loads((root/'docs/experiments/change-detection-v1.audit.json').read_bytes())
audit=sum(len(b['rows']) for a in a['records'] for side in a['blocks'] for b in side)
assert audit==s['budget']['auditEncounters']
assert decisions+audit==s['budget']['total']
result={'resultSha256':hashlib.sha256(raw).hexdigest(),'rawArithmeticMatched':True,'comparisons':checks,'learningEncounters':decisions,'auditEncounters':audit}
p=root/'docs/releases/change-detection-v1.primary-arithmetic.json'
if p.exists():assert json.loads(p.read_text())==result
else:p.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
