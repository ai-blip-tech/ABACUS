"""Local Pascal bridge: normal Room Design session, encrypted SSH tunnel, no browser keys."""
import os
import shlex
import shutil
import subprocess
from pathlib import Path

config={}
for line in Path('/private/tmp/roomdesign-3d-access.env').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k,v=line.split('=',1);config[k.strip()]=v.strip().strip('"\'')
secret=subprocess.check_output(['ssh','-i',config['SSH_KEY_FILE'],'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10',config['SSH_USER']+'@'+config['SSH_HOST'],'cat "$HOME/.config/roomdesign-model3d-service-key"'],stderr=subprocess.PIPE).decode().strip()
if len(secret)<32:raise SystemExit('Coordinator key unavailable')
env={**os.environ,'MODEL3D_SERVICE_SECRET':secret,'MODEL3D_INTERNAL_URL':'http://127.0.0.1:4197','MODEL3D_DEV_ORIGINS':'http://localhost:4198,http://127.0.0.1:4198','ROOM_DESIGN_DATA_DIR':'/private/tmp/room-pascal-planning-data-20261031','COOKIE_SECURE':'false','NODE_ENV':'development'}
node=os.environ.get('ROOMDESIGN_NODE') or shutil.which('node')
os.chdir(Path(__file__).resolve().parents[2])
os.execvpe(node,[node,'node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3137'],env)
