import hashlib
import json
import os
from pathlib import Path

versions = {
    'trellisSource': os.environ['TRELLIS_COMMIT'],
    'trellisWeights': 'af44b45f2e35a493886929c6d786e563ec68364d',
    'dinoWeights': 'ea8dc2863c51be0a264bab82070e3e8836b02d51',
    'rembgWeights': 'e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4',
    'workerVersion': 'roomdesign-1',
}
revision = hashlib.sha256(json.dumps(versions, sort_keys=True).encode()).hexdigest()
Path('/opt/model3d/build.json').write_text(json.dumps({'engineRevision': revision, 'versions': versions, 'bundledWeights': False}))
