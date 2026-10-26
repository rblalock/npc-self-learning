#!/usr/bin/env python3
"""Freeze the complete switching study for offline physical replay."""
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
raw_results = (run / 'results.json').read_bytes()
results = json.loads(raw_results)
assert not results.get('incomplete')
files = {}
for name, expected in results['sources'].items():
    path = (root / name).resolve()
    assert path.is_relative_to(root)
    content = path.read_bytes()
    assert hashlib.sha256(content).hexdigest() == expected, name
    files[name] = content
for name in ['results.json', 'summary.json', 'verification.json', 'arithmetic.json', 'view.html']:
    files[name] = (run / name).read_bytes()
for name in ['scripts/replay-agentic-v3.mjs', 'scripts/agentic-v3/view.html', 'scripts/analyze-agentic-v3.py']:
    files[name] = (root / name).read_bytes()
files['package.json'] = b'{"name":"npc-switching-v3-evidence","private":true,"type":"module","scripts":{"verify":"node scripts/verify-agentic-v3.mjs results.json"}}\n'
files['README.txt'] = b'''Tactical Air: minimum-exposure NPC switching study, v3

Node.js 24, Python 3 and system tar. No package install or model account required.
shasum -a 256 -c SHA256SUMS
npm run verify
python3 scripts/analyze-agentic-v3.py results.json summary.json
node scripts/replay-agentic-v3.mjs results.json regenerated-view.html

Open view.html to inspect actual fights, proposals and applied plans.
The three-observation rule is an execution constraint, not a statistical test.
Both active arms retain full planner history/notes and ordinary Rust learning.
Two familiar worlds and reused schedules are development evidence only.
Replay uses recorded decisions; new model sampling may differ.
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
