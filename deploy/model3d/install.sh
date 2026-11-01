#!/usr/bin/env bash
# Run from an uploaded, reviewed release on the Amsterdam host as root.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
release=$(cd "$(dirname "$0")/../.." && pwd)
/usr/bin/node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||a===22&&b<13)process.exit(1)'
root=/var/lib/room-design/model-library
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/var/backups/roomdesign-model3d/$stamp
mkdir -p "$backup"
# Reject updates while GPUs or unfinished jobs require supervision.
if test -f "$root/library.sqlite"; then
  /usr/bin/node --input-type=module -e 'import {DatabaseSync} from "node:sqlite";const d=new DatabaseSync(process.argv[1],{readOnly:true});const r=d.prepare("SELECT COUNT(*) AS n FROM jobs WHERE state IN (\u0027provisioning\u0027,\u0027running\u0027) OR stop_state=\u0027pending\u0027").get();d.close();if(r.n){console.error("Active GPU jobs: finish cleanup before deployment");process.exit(1)}' "$root/library.sqlite"
fi
systemctl stop roomdesign-model3d.service 2>/dev/null || true
systemctl stop roomdesign-model3d-watchdog.timer roomdesign-model3d-watchdog.service 2>/dev/null || true
if test -f "$root/library.sqlite"; then
  /usr/bin/node --input-type=module -e 'import {DatabaseSync} from "node:sqlite";const d=new DatabaseSync(process.argv[1]);d.exec("PRAGMA wal_checkpoint(TRUNCATE)");d.close()' "$root/library.sqlite"
fi
test ! -d /opt/roomdesign-model3d || cp -a /opt/roomdesign-model3d "$backup/service"
test ! -f /etc/roomdesign-model3d.env || cp -a /etc/roomdesign-model3d.env "$backup/model3d.env"
if test -d "$root"; then tar -C /var/lib/room-design -czf "$backup/library.tgz" model-library; gzip -t "$backup/library.tgz"; fi
chmod -R go-rwx "$backup"
id roomdesign-model3d >/dev/null 2>&1 || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin roomdesign-model3d
install -d -o roomdesign-model3d -g roomdesign-model3d -m 0750 "$root"
install -d -m 0755 /opt/roomdesign-model3d
cp "$release"/services/model3d/*.mjs /opt/roomdesign-model3d/
if ! test -f /etc/roomdesign-model3d.env; then
  install -m 0600 "$release/deploy/model3d/model3d.env.example" /etc/roomdesign-model3d.env
  python3 - <<'PY'
import secrets
from pathlib import Path
p=Path('/etc/roomdesign-model3d.env')
p.write_text(p.read_text().replace('MODEL3D_SERVICE_SECRET=\n','MODEL3D_SERVICE_SECRET='+secrets.token_hex(32)+'\n'))
PY
fi
# Deployment itself never starts a paid job; enable explicitly after the live smoke test.
python3 - <<'PY'
from pathlib import Path
import re
p=Path('/etc/roomdesign-model3d.env')
s=p.read_text()
s=re.sub(r'^MODEL3D_GENERATION_ENABLED=.*$', 'MODEL3D_GENERATION_ENABLED=false', s, flags=re.M)
p.write_text(s)
PY
install -m 0644 "$release"/deploy/model3d/roomdesign-model3d*.service "$release"/deploy/model3d/roomdesign-model3d-watchdog.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now roomdesign-model3d-watchdog.timer
systemctl enable --now roomdesign-model3d.service
systemctl is-active --quiet roomdesign-model3d.service
echo "Installed. Backup: $backup. Generation remains disabled until configured."
