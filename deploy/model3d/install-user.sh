#!/usr/bin/env bash
# Restricted SSH alternative: installs only in the current user's home.
# Does not edit the production site, root's PM2, Nginx, sudoers or account privileges.
set -euo pipefail
release=$(cd "$(dirname "$0")/../.." && pwd)
base="$HOME/roomdesign-model3d"
root="$HOME/room-design-data/model-library"
envfile="$HOME/.config/roomdesign-model3d.env"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$HOME/backups/roomdesign-model3d/$stamp"
mkdir -p "$backup"
chmod 0700 "$backup"
if test -f "$root/library.sqlite"; then
  node --input-type=module -e 'import {DatabaseSync} from "node:sqlite";const d=new DatabaseSync(process.argv[1],{readOnly:true});const n=d.prepare("SELECT COUNT(*) AS n FROM jobs WHERE state IN (\u0027provisioning\u0027,\u0027running\u0027) OR stop_state=\u0027pending\u0027").get().n;d.close();if(n)process.exit(1)' "$root/library.sqlite"
fi
pm2 stop roomdesign-model3d >/dev/null 2>&1 || true
test ! -d "$base" || cp -a "$base" "$backup/service"
test ! -f "$envfile" || cp -a "$envfile" "$backup/model3d.env"
if test -d "$root"; then
  tar -C "$(dirname "$root")" -czf "$backup/library.tgz" model-library
  gzip -t "$backup/library.tgz"
fi
mkdir -p "$base" "$root" "$HOME/.config"
chmod 0750 "$base" "$root"
cp "$release"/services/model3d/*.mjs "$base/"
if ! test -f "$envfile"; then
  install -m 0600 "$release/deploy/model3d/model3d.env.example" "$envfile"
  python3 - "$envfile" "$root" <<'PY'
import sys,secrets
from pathlib import Path
p=Path(sys.argv[1]);s=p.read_text()
s=s.replace('MODEL3D_SERVICE_SECRET=\n','MODEL3D_SERVICE_SECRET='+secrets.token_hex(32)+'\n')
s=s.replace('MODEL3D_STORAGE_DIR=/var/lib/room-design/model-library','MODEL3D_STORAGE_DIR='+sys.argv[2])
p.write_text(s)
PY
fi
python3 - "$envfile" "$HOME/.config/roomdesign-model3d-service-key" <<'PY'
import os,sys
from pathlib import Path
d=dict(line.split('=',1) for line in Path(sys.argv[1]).read_text().splitlines() if '=' in line and not line.startswith('#'))
p=Path(sys.argv[2]);fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as f:f.write(d['MODEL3D_SERVICE_SECRET']+'\n')
os.chmod(p,0o600)
PY
python3 - "$envfile" <<'PY'
import sys,re
from pathlib import Path
p=Path(sys.argv[1]);p.write_text(re.sub(r'^MODEL3D_GENERATION_ENABLED=.*$','MODEL3D_GENERATION_ENABLED=false',p.read_text(),flags=re.M))
PY
pm2 delete roomdesign-model3d >/dev/null 2>&1 || true
pm2 start "$base/start.mjs" --name roomdesign-model3d --interpreter /usr/bin/node --node-args="--env-file=$envfile" --max-memory-restart 512M >/dev/null
pm2 save >/dev/null
# Preserve all pre-existing crontab entries; replace our own bounded block only.
if command -v crontab >/dev/null && command -v flock >/dev/null; then
  python3 - "$base" "$envfile" "$root" <<'PY'
import sys,subprocess,re,shlex
base,envfile,root=sys.argv[1:]
current=subprocess.run(['crontab','-l'],text=True,capture_output=True).stdout
current=re.sub(r'\n?# BEGIN ROOMDESIGN MODEL3D\n.*?# END ROOMDESIGN MODEL3D\n?', '\n', current, flags=re.S)
block='\n# BEGIN ROOMDESIGN MODEL3D\n'
block+='@reboot /usr/local/bin/pm2 resurrect >/dev/null 2>&1\n'
block+='* * * * * /usr/bin/flock -n '+shlex.quote(root+'/watchdog.lock')+' /usr/bin/node --env-file='+shlex.quote(envfile)+' '+shlex.quote(base+'/safety-stop.mjs')+' >>'+shlex.quote(root+'/watchdog.log')+' 2>&1\n'
block+='# END ROOMDESIGN MODEL3D\n'
subprocess.run(['crontab','-'],input=current.rstrip()+block,text=True,check=True)
PY
else
  echo 'Boot/watchdog scheduling requires administrator setup; do not enable GPU generation yet.'
fi
python3 - "$envfile" <<'PY'
import sys,time,json,urllib.request
from pathlib import Path
d=dict(line.split('=',1) for line in Path(sys.argv[1]).read_text().splitlines() if '=' in line and not line.startswith('#'))
for i in range(10):
 try:
  req=urllib.request.Request('http://127.0.0.1:'+d.get('MODEL3D_PORT','4199')+'/internal/health',headers={'X-Model-Service-Secret':d['MODEL3D_SERVICE_SECRET']})
  result=json.load(urllib.request.urlopen(req,timeout=2))
  assert result['ok'] and not result['generationEnabled']
  print('HEALTH_OK; paid generation disabled');break
 except Exception:
  if i==9:raise
  time.sleep(1)
PY
echo "Storage: $root"
echo "Backup: $backup"
