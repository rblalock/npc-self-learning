#!/usr/bin/env python3
"""Package the seven-plan diagnostic and its exact v2 input."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile

root = Path(__file__).resolve().parent.parent
run = (root / sys.argv[1]).resolve()
output = root / sys.argv[2]
r = json.loads((run / 'results.json').read_bytes())
files = {}
for name, expected in r['provenance']['sources'].items():
    path = (root / name).resolve()
    assert path.is_relative_to(root)
    content = path.read_bytes()
    assert len(content) == expected['bytes'] and hashlib.sha256(content).hexdigest() == expected['sha256'], name
    files[name] = content
name = 'docs/experiments/agentic-npc-ablation-v2.results.json.gz'
files[name] = (root / name).read_bytes()
assert hashlib.sha256(files[name]).hexdigest() == r['provenance']['input']['sha256']
for name in ['results.json', 'summary.json', 'verification.json']:
    files[name] = (run / name).read_bytes()
files['package.json'] = b'{"name":"npc-menu-opportunity-evidence","private":true,"type":"module","scripts":{"verify":"node scripts/audit-agentic-menu-v1.mjs --verify results.json"}}\n'
files['README.txt'] = b'''Tactical Air: seven-plan opportunity diagnostic

Node.js 24; no packages or model account required.
shasum -a 256 -c SHA256SUMS
npm run verify

The verifier reruns all 2,236 charged probes and trajectory fights and compares
the complete record. Prior v2 calibration and warmups are reused, not rerun.
The input, frozen sources, generated simulation and Wasm are included.
Greedy uses hidden current scenarios and seven counterfactual simulations per
fight. Its improvement is a privileged diagnostic, not an agent result or a
bound on the globally optimal policy. Familiar-world development scope only.
'''
files['SHA256SUMS'] = ''.join(hashlib.sha256(v).hexdigest()+'  '+k+'\n' for k,v in sorted(files.items())).encode()
output.parent.mkdir(parents=True, exist_ok=True)
with output.open('xb') as raw:
    with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            for name, data in sorted(files.items()):
                item = tarfile.TarInfo(name)
                item.size = len(data); item.mode = 0o644; item.mtime = 0
                item.uid = item.gid = 0; item.uname = item.gname = ''
                archive.addfile(item, io.BytesIO(data))
print(json.dumps({'files':len(files), 'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))
