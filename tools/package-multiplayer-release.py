"""Package a clean, tested Git commit, with drift checks against the live baseline."""
from pathlib import Path
import hashlib, io, json, subprocess, tarfile, uuid, sys, re
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv)>1 else '37a2dc167936d586a1fb3448035571cdc9d9d7c5'
assert re.fullmatch(r'[a-f0-9]{40}',BASE), 'Pass the exact deployed base commit'
def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)
if git('status', '--porcelain').strip():
    raise ValueError('Commit the tested source before packaging')
commit = git('rev-parse', 'HEAD').decode().strip()
paths = sorted(set(git('diff', '--name-only', BASE, commit).decode().splitlines()) | {'api/package.json','api/package-lock.json','api/multiplayer-migration.sql'})
allowed_api = {'api/server.mjs', 'api/multiplayer.mjs', 'api/city.mjs', 'api/race-store.mjs',
               'api/multiplayer-migration.sql', 'api/package.json', 'api/package-lock.json'}
def permitted(p):
    return p.startswith(('public/', 'tests/', 'tools/', '.github/workflows/')) or p in allowed_api or p in {
        'README.md', 'WASA_REMAINING_WORK_ROADMAP.md', 'MULTIPLAYER.md'}
payload, files = {}, {}
for p in paths:
    if not permitted(p):
        raise ValueError('Unexpected release path: '+p)
    payload[p] = git('show', commit+':'+p)
    previous = subprocess.run(['git', 'show', BASE+':'+p], cwd=ROOT, capture_output=True)
    files[p] = {'bytes': len(payload[p]), 'sha256': hashlib.sha256(payload[p]).hexdigest(),
                'before': hashlib.sha256(previous.stdout).hexdigest() if previous.returncode == 0 else None}
release = 'multiplayer-'+datetime.now(timezone.utc).strftime('%Y%m%d')+'-'+uuid.uuid4().hex[:8]
manifest = {'release': release, 'commit': commit, 'baseCommit': BASE, 'site': '/var/www/wasa.kasua.ng',
            'phoneTesting': 'deferred by user', 'files': files}
output = ROOT/'tmp'/('wasa-'+release+'.tar.gz')
with tarfile.open(output, 'w:gz') as archive:
    for path, data in {**payload, 'release-manifest.json': json.dumps(manifest, indent=2).encode()}.items():
        info = tarfile.TarInfo(path); info.size = len(data); info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))
(ROOT/'tmp/multiplayer-release-current.json').write_text(json.dumps({'archive': output.name,
    'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'manifest': manifest}, indent=2))
print(json.dumps({'release': release, 'commit': commit, 'files': len(files), 'bytes': output.stat().st_size}))
