"""Verify and install a packaged WASA release, saving replaced files for rollback.

Run on the authorized Linux host: python3 install-release.py ARCHIVE SHA256.
The helper only replaces manifest-listed files under the fixed WASA directory.
It does not touch API executable code, databases, secrets, Git or other sites.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import sys
import tarfile

site = Path('/var/www/wasa.kasua.ng').resolve()
archive_path = Path(sys.argv[1]).resolve()
expected = sys.argv[2]
if hashlib.sha256(archive_path.read_bytes()).hexdigest() != expected:
    raise ValueError('Archive hash mismatch')
with tarfile.open(archive_path) as archive:
    manifest = json.load(archive.extractfile('release-manifest.json'))
    if manifest['site'] != str(site):
        raise ValueError('Unexpected deployment site')
    for relative, digest in manifest['prerequisites'].items():
        path = (site/relative).resolve()
        if not path.is_relative_to(site):
            raise ValueError('Prerequisite path escapes site')
        if hashlib.sha256(path.read_bytes().replace(b'\r\n', b'\n')).hexdigest() != digest:
            raise ValueError('Live prerequisite differs from the tested build: '+relative)
    payload = {}
    for relative, metadata in manifest['files'].items():
        destination = (site/relative).resolve()
        permitted = relative.startswith(('public/', 'tests/', 'tools/')) or relative in [
            'README.md', 'REALISM_UPGRADE.md', 'api/CHARACTER-SOURCE-NOTES.md']
        if not permitted or not destination.is_relative_to(site):
            raise ValueError('File outside release scope: '+relative)
        member = archive.getmember(relative)
        if not member.isfile():
            raise ValueError('Release member is not a regular file: '+relative)
        data = archive.extractfile(member).read()
        if len(data) != metadata['bytes'] or hashlib.sha256(data).hexdigest() != metadata['sha256']:
            raise ValueError('Payload hash mismatch: '+relative)
        payload[relative] = data

backup = Path('/var/backups/wasa')/manifest['release']
backup.mkdir(parents=True, exist_ok=False)
before = {}
for relative in payload:
    destination = site/relative
    if destination.exists():
        saved = backup/relative;saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(destination, saved)
        before[relative] = hashlib.sha256(destination.read_bytes()).hexdigest()
    else:
        before[relative] = None
(backup/'release-manifest.json').write_text(json.dumps(manifest, indent=2))
(backup/'before.json').write_text(json.dumps(before, indent=2))

def restore():
    # Restore entry points/code first. New immutable assets stay for clients that
    # already opened the new version; the old entry points no longer request them.
    for relative in written:
        digest=before[relative]
        if digest is not None and hashlib.sha256((site/relative).read_bytes()).hexdigest()==manifest['files'][relative]['sha256']:
            shutil.copy2(backup/relative, site/relative)

written=[]
try:
    # Publish assets/code before either HTML entry point references them.
    order = sorted(payload, key=lambda p: p.endswith('index.html'))
    for relative in order:
        destination = site/relative;destination.parent.mkdir(parents=True, exist_ok=True)
        if before[relative] is not None and hashlib.sha256(destination.read_bytes()).hexdigest() != before[relative]:
            raise ValueError('Live file changed during installation: '+relative)
        temporary = destination.with_name(destination.name+'.'+manifest['release']+'.tmp')
        temporary.write_bytes(payload[relative]);temporary.chmod(0o644)
        os.replace(temporary, destination)
        written.append(relative)
    for relative, data in payload.items():
        if hashlib.sha256((site/relative).read_bytes()).hexdigest() != hashlib.sha256(data).hexdigest():
            raise ValueError('Installed file hash mismatch: '+relative)
except Exception:
    restore()
    raise
print(json.dumps({'release': manifest['release'], 'files': len(payload), 'backup': str(backup),
                  'status': 'installed, hashes verified'}))
