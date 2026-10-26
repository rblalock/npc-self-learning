#!/usr/bin/env python3
"""Preserve a stopped v2 attempt and its exact sources for offline replay."""
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
data = (run / 'partial.json').read_bytes()
result = json.loads(data)
if result.get('incomplete') is not True or (run / 'results.json').exists():
    raise ValueError('Expected a stopped incomplete attempt, not a completed study')
files = {}
for name, expected in result['sources'].items():
    path = (source_root / name).resolve()
    if not path.is_relative_to(source_root):
        raise ValueError('Source outside repository')
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != expected:
        raise ValueError('Frozen source changed: ' + name)
    files[name] = content
files['partial.json'] = data
files['verification.json'] = (run / 'verification.json').read_bytes()
files['journal-state.json'] = (run / 'calls/state.json').read_bytes()
name = 'scripts/verify-agentic-v2-partial.mjs'
files[name] = (root / name).read_bytes()
files['package.json'] = (json.dumps({
    'name': 'tactical-air-agentic-ablation-incomplete-evidence',
    'private': True, 'type': 'module',
    'scripts': {'verify': 'node scripts/verify-agentic-v2-partial.mjs partial.json'},
}, indent=2) + '\n').encode()
files['README.txt'] = b'''Tactical Air: incomplete between-round NPC review attempt

This is a stopped attempt, not a completed effectiveness comparison.
The permanent failure stop is retained. Do not reset or resume this journal.
Known costs and unknown timed-out costs must remain distinct.

Requires Node.js 24 and tar. No dependencies or model credentials.
Check contents: shasum -a 256 -c SHA256SUMS
Replay every recorded physical fight and decision: npm run verify

The kit preserves the actual study sources and recorded model outputs.
The partial verifier was added after the run; its checksum is included.
Replay makes no model calls and does not regenerate stochastic decisions.
Two familiar worlds do not establish unseen-world generalization.
'''
files['SHA256SUMS'] = ''.join(
    hashlib.sha256(content).hexdigest() + '  ' + name + '\n'
    for name, content in sorted(files.items())
).encode()
output.parent.mkdir(parents=True, exist_ok=True)
with output.open('xb') as raw:
    with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            for name, content in sorted(files.items()):
                entry = tarfile.TarInfo(name)
                entry.size = len(content)
                entry.mode = 0o644
                entry.mtime = 0
                entry.uid = entry.gid = 0
                entry.uname = entry.gname = ''
                archive.addfile(entry, io.BytesIO(content))
print(json.dumps({'file': str(output.relative_to(root)), 'files': len(files),
                  'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))
