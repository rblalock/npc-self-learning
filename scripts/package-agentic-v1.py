#!/usr/bin/env python3
"""Package the exact frozen pilot sources and results for offline verification."""
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
source_root = root
if len(sys.argv) > 3:
    if len(sys.argv) != 5 or sys.argv[3] != '--source-root':
        raise ValueError('Use <run-directory> <new-archive> [--source-root <frozen-checkout>]')
    source_root = Path(sys.argv[4]).resolve()
result_bytes = (run / 'results.json').read_bytes()
results = json.loads(result_bytes)
files = {}
for name, expected in results['sources'].items():
    path = (source_root / name).resolve()
    if not path.is_relative_to(source_root):
        raise ValueError('Source outside repository')
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError('Frozen source changed: ' + name)
    files[name] = data
files['results.json'] = result_bytes
files['summary.json'] = (run / 'summary.json').read_bytes()
files['view.html'] = (run / 'view.html').read_bytes()
files['package.json'] = (json.dumps({'name':'tactical-air-agentic-pilot-evidence','private':True,'type':'module',
    'scripts':{'verify':'node scripts/verify-agentic-v1.mjs results.json'}},indent=2)+'\n').encode()
files['README.txt'] = b'''Tactical Air: agent-assisted NPC development pilot

Requires Node.js 24 and tar. No dependency install or model credentials.
Verify archive contents: shasum -a 256 -c SHA256SUMS
Re-execute all combat/policy decisions: npm run verify
Open view.html to inspect the recorded fights and every agent adjustment.

This kit freezes the sources actually used for the run. It replays recorded
model outputs; it does not claim that new model requests reproduce them.
Two familiar cases are development evidence, not fresh validation.
'''
files['SHA256SUMS'] = ''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in sorted(files.items())).encode()
output.parent.mkdir(parents=True,exist_ok=True)
with output.open('xb') as raw:
    with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as compressed:
        with tarfile.open(fileobj=compressed,mode='w',format=tarfile.USTAR_FORMAT) as archive:
            for name,data in sorted(files.items()):
                entry=tarfile.TarInfo(name)
                entry.size=len(data);entry.mode=0o644;entry.mtime=0
                entry.uid=entry.gid=0;entry.uname=entry.gname=''
                archive.addfile(entry,io.BytesIO(data))
print(json.dumps({'file':str(output.relative_to(root)),'files':len(files),'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))
