"""Install the reviewed multiplayer release on WASA's existing Linux host.

Usage: python3 install-multiplayer-release.py ARCHIVE SHA256
Backs up database, source, dependencies and the WASA Nginx config. The migration
is additive. On failure restores code/config and restarts the previous API;
the new empty/compatible race tables remain. Never restores the account DB over
concurrent writes. Use the saved dump only for a separately planned recovery.
"""
from pathlib import Path
import gzip, hashlib, json, os, shutil, subprocess, sys, tarfile, time, urllib.request, re

SITE = Path('/var/www/wasa.kasua.ng').resolve()
NGINX = Path('/etc/nginx/sites-available/wasa.kasua.ng')
ARCHIVE = Path(sys.argv[1]).resolve()
assert hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() == sys.argv[2], 'Archive hash mismatch'
def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)
def digest(data): return hashlib.sha256(data).hexdigest()
def permitted(p):
    return p.startswith(('public/', 'tests/', 'tools/', '.github/workflows/')) or p in {
        'api/server.mjs', 'api/multiplayer.mjs', 'api/city.mjs', 'api/race-store.mjs', 'api/multiplayer-migration.sql',
        'api/package.json', 'api/package-lock.json', 'README.md', 'MULTIPLAYER.md', 'WASA_REMAINING_WORK_ROADMAP.md'}
payload = {}
with tarfile.open(ARCHIVE) as tar:
    manifest = json.load(tar.extractfile('release-manifest.json'))
    assert manifest['site'] == str(SITE) and re.fullmatch(r'multiplayer-\d{8}-[a-f0-9]{8}', manifest['release'])
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=SITE,text=True).strip() == manifest['baseCommit'], 'Unexpected live Git baseline'
    assert not subprocess.check_output(['git','status','--porcelain'],cwd=SITE,text=True).strip(), 'Live source is dirty'
    assert (Path('/etc/nginx/sites-enabled/wasa.kasua.ng').resolve() == NGINX.resolve()), 'Unexpected Nginx config'
    for p, meta in manifest['files'].items():
        target = (SITE/p).resolve()
        assert permitted(p) and target.is_relative_to(SITE), 'Path outside release scope'
        member = tar.getmember(p); assert member.isfile()
        data = tar.extractfile(member).read()
        assert len(data) == meta['bytes'] and digest(data) == meta['sha256'], 'Payload differs'
        assert (digest(target.read_bytes().replace(b'\r\n',b'\n')) if target.exists() else None) == meta['before'], 'Live file drift: '+p
        payload[p] = data
BACKUP = Path('/var/backups/wasa')/manifest['release']
BACKUP.mkdir(parents=True,exist_ok=False); BACKUP.chmod(0o700)
(BACKUP/'release-manifest.json').write_text(json.dumps(manifest,indent=2))
for p in payload:
    if (SITE/p).exists():
        saved = BACKUP/p; saved.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(SITE/p,saved)
shutil.copy2(NGINX,BACKUP/'nginx.conf')
shutil.copytree(SITE/'api/node_modules',BACKUP/'node_modules')
with gzip.open(BACKUP/'database-before.sql.gz','wb') as saved:
    dump = subprocess.check_output(['runuser','-u','wasa','--','pg_dump','--no-owner','--no-acl','wasa_dev'])
    saved.write(dump)
# Verify the backup decodes completely before changing the running service.
with gzip.open(BACKUP/'database-before.sql.gz','rb') as saved:
    assert digest(saved.read()) == digest(dump), 'Database backup verification failed'
stage = BACKUP/'staging'; stage.mkdir()
for p,data in payload.items():
    target=stage/p; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
# Resolve the lockfile before interrupting any live account requests.
run('npm','ci','--omit=dev','--no-fund',cwd=stage/'api')
for p in payload:
    if p.endswith(('.mjs','.js')) and not p.startswith('public/vendor/'):
        run('/opt/wasa/bin/node','--check',str(stage/p))
config = NGINX.read_text()
has_socket = 'location = /api/multiplayer/socket' in config
marker = '    location ^~ /api/ {'
assert config.count(marker) == 1
websocket = '''    location = /api/multiplayer/socket {
        proxy_pass http://127.0.0.1:3200;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_connect_timeout 3s;
        proxy_buffering off;
    }

'''
if has_socket: assert websocket.strip() in config, 'Live WebSocket proxy differs; inspect before changing it'
written=[]; stopped=False
try:
    run('systemctl','stop','wasa-api'); stopped=True
    for p,data in sorted(payload.items(),key=lambda item:item[0].endswith('.html')):
        target=SITE/p; target.parent.mkdir(parents=True,exist_ok=True)
        assert (digest(target.read_bytes().replace(b'\r\n',b'\n')) if target.exists() else None) == manifest['files'][p]['before'], 'File changed during deployment: '+p
        temp=target.with_name(target.name+'.'+manifest['release']+'.tmp');temp.write_bytes(data);temp.chmod(0o644);os.replace(temp,target);written.append(p)
    migration=SITE/'api/multiplayer-migration.sql'
    run('runuser','-u','wasa','--','psql','-v','ON_ERROR_STOP=1','-d','wasa_dev','-f',str(migration))
    shutil.rmtree(SITE/'api/node_modules');shutil.copytree(stage/'api/node_modules',SITE/'api/node_modules')
    run('chown','-R','wasa:wasa',str(SITE/'api/node_modules'))
    NGINX.write_text(config if has_socket else config.replace(marker,websocket+marker));run('nginx','-t');run('systemctl','start','wasa-api')
    for attempt in range(15):
        try:
            health=json.load(urllib.request.urlopen('http://127.0.0.1:3200/api/health',timeout=2))
            assert health['stage']=='multiplayer-alpha'
            json.load(urllib.request.urlopen('http://127.0.0.1:3200/api/races/leaderboard',timeout=2))
            break
        except Exception:
            if attempt==14: raise
            time.sleep(.5)
    run('systemctl','reload','nginx')
    for p,data in payload.items(): assert digest((SITE/p).read_bytes())==digest(data)
except Exception:
    if stopped: run('systemctl','stop','wasa-api')
    for p in reversed(written):
        target=SITE/p;saved=BACKUP/p
        if target.exists() and digest(target.read_bytes())==manifest['files'][p]['sha256']:
            if saved.exists(): shutil.copy2(saved,target)
            else: target.unlink()
    shutil.copy2(BACKUP/'nginx.conf',NGINX)
    if stopped:
        shutil.rmtree(SITE/'api/node_modules');shutil.copytree(BACKUP/'node_modules',SITE/'api/node_modules')
        run('chown','-R','wasa:wasa',str(SITE/'api/node_modules'));run('systemctl','start','wasa-api')
    run('nginx','-t');run('systemctl','reload','nginx')
    raise
print(json.dumps({'release':manifest['release'],'commit':manifest['commit'],'files':len(payload),'backup':str(BACKUP),'status':'installed; API and database healthy'}))
