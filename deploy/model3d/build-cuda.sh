#!/usr/bin/env bash
set -euo pipefail
# CUDA extensions can be cross-compiled with nvcc without an attached GPU.
# The vendor setup script detects a runtime GPU unnecessarily; select its CUDA
# branch explicitly for this pinned source revision, without faking a device.
command -v nvcc >/dev/null
export BUILD_TARGET=cuda
python - <<'PY'
from pathlib import Path
s=Path('setup.sh').read_text()
begin=s.index('if command -v nvidia-smi')
end=s.index('if [ "$NEW_ENV" = true ]',begin)
s=s[:begin]+'PLATFORM="cuda"\n'+s[end:]
s=s.replace('sudo apt install -y libjpeg-dev','apt-get install -y libjpeg-dev')
Path('/tmp/setup-roomdesign-cuda.sh').write_text(s)
PY
bash /tmp/setup-roomdesign-cuda.sh --basic --cumesh --o-voxel --flexgemm --nvdiffrast --nvdiffrec
python -m pip install transformers==4.57.1 einops==0.8.2
python -m pip install --no-deps xformers==0.0.32.post2
rm -rf /root/.cache/pip /tmp/extensions /tmp/setup-roomdesign-cuda.sh
