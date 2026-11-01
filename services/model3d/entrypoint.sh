#!/usr/bin/env bash
set -euo pipefail
cd /opt/TRELLIS.2
python -u /opt/model3d/guard.py &
exec python -u /opt/model3d/worker.py
