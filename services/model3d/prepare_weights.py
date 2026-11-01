"""Pinned weights: runtime HTTPS download or private build with a BuildKit secret."""
import json
import hashlib
import os
from pathlib import Path
from huggingface_hub import snapshot_download

token_path = Path('/run/secrets/hf_token')
token = token_path.read_text().strip() if token_path.exists() else os.environ.pop('HF_TOKEN', None)
if not token:
    raise RuntimeError('The approved DINOv3 Read token must be supplied privately')
build_path = Path('/opt/model3d/build.json')
expected = json.loads(build_path.read_text()) if build_path.exists() else None
pinned = expected['versions'] if expected else {}
weights = snapshot_download('microsoft/TRELLIS.2-4B', revision=pinned.get('trellisWeights'))
dino = snapshot_download('facebook/dinov3-vitl16-pretrain-lvd1689m', revision=pinned.get('dinoWeights'), allow_patterns=['config.json', 'preprocessor_config.json', 'model.safetensors'], token=token)
rembg = snapshot_download('ZhengPeng7/BiRefNet', revision=pinned.get('rembgWeights'))
config_path = Path(weights) / 'pipeline.json'
config = json.loads(config_path.read_text())
config['args']['image_cond_model']['args']['model_name'] = dino
config['args']['rembg_model']['args']['model_name'] = rembg
(Path(weights) / 'pipeline-roomdesign.json').write_text(json.dumps(config))
Path('/opt/model3d/pipeline-location.json').write_text(json.dumps({'weights': weights}))
versions = {'trellisSource': os.environ['TRELLIS_COMMIT'], 'trellisWeights': Path(weights).name, 'dinoWeights': Path(dino).name, 'rembgWeights': Path(rembg).name, 'workerVersion': 'roomdesign-1'}
revision = hashlib.sha256(json.dumps(versions, sort_keys=True).encode()).hexdigest()
if expected and expected['engineRevision'] != revision:
    raise RuntimeError('Downloaded weights do not match the pinned build manifest')
if not expected:
    build_path.write_text(json.dumps({'engineRevision': revision, 'versions': versions, 'bundledWeights': True}))
# No login()/token cache: only model blobs and revision metadata are retained.
token = None
