#!/usr/bin/env python3
"""Check committed files, nested distributions, and author metadata before publishing."""
from pathlib import Path
import gzip
import hashlib
import io
import re
import subprocess
import tarfile

root = Path(__file__).resolve().parent.parent
seen = set()
errors = []
patterns = {
    'personal home path': re.compile(rb'/(?:Users|home)/(?!runner(?:/|\b))[^/\s\x00"<>]+/'),
    'personal removable-volume path': re.compile(rb'/run/' + rb'media/[^/\s\x00"<>]+/'),
    'personal email': re.compile(rb'[A-Za-z0-9_.+%-]{1,64}@(?:gmail|yahoo|hotmail|outlook|icloud|protonmail)\.com\b', re.I),
    'private key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----'),
    'access token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{15,})'),
    'authenticated URL': re.compile(rb'https?://[^/\s:"<>]+:[^@\s"<>]+@'),
}
private_names = {'.env', '.npmrc', '.netrc', 'id_rsa', 'id_ed25519', 'handoff.md', 'editorial-review.md', 'article-draft.md'}

def inspect(data, name, depth=0):
    if depth > 8:
        errors.append((name, 'archive nesting exceeds review limit')); return
    if any(part in private_names or part.startswith('.env.') or part in ('.impeccable', '.omakaseagent', '.openai', '.vercel') for part in Path(name.replace("!", "/")).parts):
        errors.append((name, 'private working file'))
    identity = hashlib.sha256(data).digest()
    if identity in seen: return
    seen.add(identity)
    if data.startswith(b'\x1f\x8b'):
        inspect(gzip.decompress(data), name + '!gzip', depth + 1); return
    if len(data) > 262 and data[257:262] == b'ustar':
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as archive:
            for member in archive:
                child = name + '!' + member.name
                if member.uid or member.gid or member.uname or member.gname:
                    errors.append((child, 'archive contains account ownership'))
                if member.issym() or member.islnk():
                    errors.append((child, 'archive link requires review'))
                if member.isfile(): inspect(archive.extractfile(member).read(), child, depth + 1)
        return
    for label, pattern in patterns.items():
        if pattern.search(data): errors.append((name, label))

files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
for name in files:
    if name: inspect((root / name).read_bytes(), name)
authors = subprocess.check_output(['git', 'log', '--all', '--format=%ae%n%ce'], cwd=root).decode().splitlines()
for email in set(authors):
    if not email.endswith('@users.noreply.github.com'):
        errors.append(('Git history', 'author or committer must use a GitHub noreply address'))
for name, reason in errors: print(f'{name}: {reason}')
print(f'Checked {len(files)-1} tracked files and {len(seen)} distinct contents; {len(errors)} privacy findings.')
raise SystemExit(bool(errors))
