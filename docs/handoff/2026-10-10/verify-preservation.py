#!/usr/bin/env python3
"""Read-only byte-preservation checks. Does not run application tests."""
from pathlib import Path
import hashlib
import json

here = Path(__file__).resolve().parent
repo = here.parents[2]
errors = []
count = 0
for line in (here / 'SHA256SUMS').read_text().splitlines():
    expected, path = line.split('  ', 1)
    file = here / path
    count += 1
    if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
        errors.append(path)
checkpoint = json.loads((here / 'source-checkpoint.json').read_text())
for entry in checkpoint['files']:
    file = repo / entry['path']
    if not file.is_file():
        errors.append(entry['path'])
        continue
    data = file.read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if hashlib.sha256(data).hexdigest() != entry['sha256'] or blob != entry['gitBlobSha']:
        errors.append(entry['path'])
if errors:
    raise SystemExit('Preservation mismatch: ' + ', '.join(errors))
print(f'Verified {count} handoff files and {len(checkpoint["files"])} source paths. Byte preservation only; application tests and GUI acceptance were not run.')
