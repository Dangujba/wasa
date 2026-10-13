"""Package only WASA's reviewed static/character changes for its existing host."""
from pathlib import Path
import hashlib
import io
import json
import tarfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
release = 'wardrobe-20261013-'+uuid.uuid4().hex[:8]
files = [
    'public/world/index.html', 'public/world/world.js', 'public/world/street-block.js',
    'public/world/DATA-SOURCES.md', 'public/rendering/wasa-rendering.js',
    'public/avatar/index.html', 'public/avatar/avatar-model.js',
    'public/avatar/wasa-human-lite.js', 'public/avatar/wasa-rigged-human.js',
    'public/vendor/babylonjs.loaders.min.js',
    'public/avatar/models/wasa-masculine.glb', 'public/avatar/models/wasa-feminine.glb',
    'public/avatar/models/wasa-masculine.manifest.json', 'public/avatar/models/wasa-feminine.manifest.json',
    'public/avatar/models/ART-SOURCES.md', 'public/avatar/models/MAKEHUMAN-CC0.md',
    'public/assets/street-block/foliage-cluster-512.png', 'public/assets/street-block/ART-SOURCES.md',
    'README.md', 'REALISM_UPGRADE.md', 'api/CHARACTER-SOURCE-NOTES.md',
    'tools/build-wardrobe.py', 'tools/build-jamfa.py',
    'tests/realism.test.cjs', 'tests/street-block.test.cjs', 'tests/world-controls.test.cjs',
    'tests/rigged-avatar.test.cjs',
]
prerequisites = ['public/vendor/babylon.min.js', 'public/world/data/damaturu-region-v3.json',
                 'public/avatar/avatar.js', 'public/avatar/avatar.css', 'public/world/world.css']
manifest = {'release': release, 'site': '/var/www/wasa.kasua.ng', 'phoneTesting': 'deferred by user',
            'files': {p: {'sha256': hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),
                          'bytes': (ROOT/p).stat().st_size} for p in files},
            'prerequisites': {p: hashlib.sha256((ROOT/p).read_bytes().replace(b'\r\n', b'\n')).hexdigest()
                              for p in prerequisites}}
output = ROOT/'tmp'/('wasa-'+release+'.tar.gz')
with tarfile.open(output, 'w:gz') as archive:
    for path in files:
        info = archive.gettarinfo(str(ROOT/path), arcname=path)
        info.mode = 0o644
        with (ROOT/path).open('rb') as stream:
            archive.addfile(info, stream)
    data = json.dumps(manifest, indent=2).encode()
    info = tarfile.TarInfo('release-manifest.json');info.size = len(data);info.mode = 0o644
    archive.addfile(info, io.BytesIO(data))
(ROOT/'tmp/release-current.json').write_text(json.dumps({'archive': output.name,
    'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'manifest': manifest}, indent=2))
print(json.dumps({'archive': str(output), 'release': release, 'files': len(files), 'bytes': output.stat().st_size}))
