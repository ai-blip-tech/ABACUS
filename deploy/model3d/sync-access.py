"""Install the supplied account key on the requested coordinator host, without printing it."""
import json
import re
import shlex
import subprocess
import sys
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else '/private/tmp/roomdesign-3d-access.env')
if path.stat().st_mode & 0o077:
    raise SystemExit('Access file must have permissions 0600')
config = {}
for line in path.read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        config[key.strip()] = value.strip().strip('"\'')
host, user, keyfile = (config[k] for k in ['SSH_HOST', 'SSH_USER', 'SSH_KEY_FILE'])
if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.:-]*', host) or not re.fullmatch(r'[a-z_][a-z0-9_-]*', user) or not Path(keyfile).is_absolute():
    raise SystemExit('Invalid SSH configuration')
if len(config.get('RUNPOD_API_KEY', '')) < 20 or any(c.isspace() for c in config['RUNPOD_API_KEY']):
    raise SystemExit('Missing or malformed RunPod account key')
remote = r'''
import sys,json,os,re
from pathlib import Path
payload=json.load(sys.stdin)
p=Path.home()/'.config/roomdesign-model3d.env'
s=p.read_text()
for name,key in [('RUNPOD_API_KEY',payload['key']),('HF_TOKEN',payload.get('hfToken',''))]:
 if '\n' in key or '\r' in key:raise SystemExit('Invalid key')
 line=name+'='+key
 if re.search('^'+name+'=',s,flags=re.M):s=re.sub('^'+name+'=.*$',lambda _:line,s,flags=re.M)
 else:s+='\n'+line+'\n'
s=re.sub(r'^MODEL3D_GENERATION_ENABLED=.*$','MODEL3D_GENERATION_ENABLED=false',s,flags=re.M)
temporary=p.with_suffix('.tmp')
fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as f:f.write(s);f.flush();os.fsync(f.fileno())
os.replace(temporary,p)
print('RunPod key installed; generation remains disabled')
'''
command = ['ssh', '-i', keyfile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', user + '@' + host, 'python3 -c ' + shlex.quote(remote)]
subprocess.run(command, input=json.dumps({'key': config['RUNPOD_API_KEY'], 'hfToken': config.get('HF_TOKEN','')}), text=True, check=True)
# Keys remain server-side; no token enters source control, CI or a public image.
