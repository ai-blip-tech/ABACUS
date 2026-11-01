"""One disposable GPU job. Upload durable GLB before stopping; no UI or inbound ports."""
import base64
import hashlib
import io
import json
import os
import threading
import time
import requests

JOB = os.environ['MODEL3D_JOB_ID']
TOKEN = os.environ['MODEL3D_JOB_TOKEN']
BASE = os.environ['MODEL3D_CALLBACK_URL'].rstrip('/') + '/' + JOB
DEADLINE = int(os.environ['MODEL3D_DEADLINE_MS']) / 1000
SESSION = requests.Session()
SESSION.headers['Authorization'] = 'Bearer ' + TOKEN
stage = 'loading'
finished = threading.Event()


def heartbeat():
    while not finished.is_set():
        try:
            r = SESSION.post(BASE + '/heartbeat', json={'stage': stage}, timeout=10)
            if r.status_code == 409:
                return
        except requests.RequestException:
            pass
        finished.wait(15)


def stop_own_pod():
    """Vendor injects a Pod-scoped key. Never send the account key to a GPU."""
    from guard import stop_own_pod as stop
    stop()


def run():
    global stage
    start = time.monotonic()
    response = SESSION.get(BASE + '/input', timeout=20)
    response.raise_for_status()
    task = response.json()
    build = json.load(open('/opt/model3d/build.json'))
    if task['engineRevision'] != build['engineRevision']:
        raise RuntimeError('Worker revision mismatch')
    if time.time() >= DEADLINE:
        raise RuntimeError('Job deadline exceeded')
    threading.Thread(target=heartbeat, daemon=True).start()
    if not build.get('bundledWeights'):
        import prepare_weights  # Verified revisions, gated download directly from HF.
    os.environ['ATTN_BACKEND'] = 'xformers'
    os.environ['SPARSE_ATTN_BACKEND'] = 'xformers'
    os.environ['OPENCV_IO_ENABLE_OPENEXR'] = '1'
    os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'
    from PIL import Image
    import torch
    import xformers.ops as xops
    attention = xops.memory_efficient_attention

    def cutlass_attention(*args, **kwargs):
        kwargs['op'] = (xops.fmha.cutlass.FwOp, xops.fmha.cutlass.BwOp)
        return attention(*args, **kwargs)

    xops.memory_efficient_attention = cutlass_attention
    from trellis2.pipelines import Trellis2ImageTo3DPipeline
    import o_voxel
    config = json.load(open('/opt/model3d/pipeline-location.json'))
    pipeline = Trellis2ImageTo3DPipeline.from_pretrained(config['weights'], config_file='pipeline-roomdesign.json')
    pipeline.cuda()
    print(json.dumps({'stage': 'loaded', 'seconds': time.monotonic() - start}), flush=True)
    stage = 'generating'
    settings = task['settings']
    image = Image.open(io.BytesIO(base64.b64decode(task['imageBase64'])))
    pipeline_type = '512' if settings['resolution'] == '512' else '1024_cascade'
    mesh = pipeline.run(image, seed=settings['seed'], pipeline_type=pipeline_type)[0]
    stage = 'exporting'
    glb = o_voxel.postprocess.to_glb(
        vertices=mesh.vertices, faces=mesh.faces, attr_volume=mesh.attrs,
        coords=mesh.coords, attr_layout=mesh.layout, voxel_size=mesh.voxel_size,
        aabb=[[-.5, -.5, -.5], [.5, .5, .5]],
        decimation_target=settings['maxFaces'], texture_size=settings['textureSize'],
        remesh=True, remesh_band=1, remesh_project=0, verbose=False,
    )
    path = '/tmp/roomdesign-model.glb'
    glb.export(path, extension_webp=True)
    with open(path, 'rb') as handle:
        result = handle.read()
    digest = hashlib.sha256(result).hexdigest()
    stage = 'uploading'
    # A lost ACK is safe: Amsterdam accepts the same result again idempotently.
    for attempt in range(5):
        if time.time() + 20 >= DEADLINE:
            break
        try:
            r = SESSION.put(BASE + '/result', data=result, headers={'Content-Type': 'model/gltf-binary'}, timeout=(10, 30))
            if r.status_code == 200:
                receipt = r.json()
                if receipt.get('durable') is True and receipt.get('sha256') == digest:
                    print(json.dumps({'stage': 'durable', 'assetId': receipt['assetId'], 'bytes': len(result), 'seconds': time.monotonic() - start}), flush=True)
                    return
            if 400 <= r.status_code < 500 and r.status_code not in (408, 429):
                break
        except requests.RequestException:
            pass
        time.sleep(min(2 ** attempt, 8))
    raise RuntimeError('Durable upload could not be confirmed')


if __name__ == '__main__':
    try:
        run()
    except Exception as error:
        # Do not print exception messages: transport errors can contain request URLs.
        print(json.dumps({'stage': 'failed', 'type': type(error).__name__}), flush=True)
        try:
            SESSION.post(BASE + '/failed', json={'failed': True}, timeout=10)
        except requests.RequestException:
            pass
        raise SystemExit(1)
    finally:
        finished.set()
        stop_own_pod()
